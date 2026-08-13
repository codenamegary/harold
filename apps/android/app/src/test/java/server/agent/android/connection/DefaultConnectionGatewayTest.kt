package server.agent.android.connection

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage
import server.agent.android.events.ConnectionStatus
import server.agent.android.events.DisconnectCause
import server.agent.android.events.SessionStream
import server.agent.android.events.SessionStreamFactory
import server.agent.android.events.SessionStreamHandlers

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultConnectionGatewayTest {
    @Test
    fun opensASingleSessionStreamOnConnect() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(liveThen(DisconnectCause.Protocol("stop"))),
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(1, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), gateway.state.value.status)
    }

    @Test
    fun reconnectsAfterRetryableDisconnect() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(
                liveThen(DisconnectCause.Retryable("closed")),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), gateway.state.value.status)
    }

    @Test
    fun backsOffExponentiallyWithoutJitter() = runTest {
        val factory = ScriptedSessionStreamFactory(
            scripts = List(4) { closedWith(DisconnectCause.Retryable("refused")) } +
                listOf(closedWith(DisconnectCause.Protocol("stop"))),
            now = { testScheduler.currentTime },
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(listOf(0L, 250L, 750L, 1_750L, 3_750L), factory.openedAt)
    }

    @Test
    fun restartsTheBackoffScheduleOnceASocketOpens() = runTest {
        val factory = ScriptedSessionStreamFactory(
            scripts = listOf(
                closedWith(DisconnectCause.Retryable("refused")),
                closedWith(DisconnectCause.Retryable("refused")),
                liveThen(DisconnectCause.Retryable("closed")),
                closedWith(DisconnectCause.Retryable("refused")),
                closedWith(DisconnectCause.Protocol("stop")),
            ),
            now = { testScheduler.currentTime },
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(listOf(0L, 250L, 750L, 1_000L, 1_500L), factory.openedAt)
    }

    @Test
    fun stopsAutoRetryOnUnauthorized() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(liveThen(DisconnectCause.Unauthorized("unauthorized"))),
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(1, factory.openCount)
        assertEquals(ConnectionStatus.AuthFailed(detail = "unauthorized"), gateway.state.value.status)
    }

    @Test
    fun retryAfterAuthFailureOpensAgain() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(
                liveThen(DisconnectCause.Unauthorized("unauthorized")),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()
        gateway.retry()
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), gateway.state.value.status)
    }

    @Test
    fun setTargetSendsSubscribeOnTheOpenSocket() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()
        gateway.setTarget("cursor", "sess_01")
        advanceUntilIdle()

        assertEquals(
            listOf(
                SessionStreamClientMessage.Subscribe(agentId = "cursor", sessionId = "sess_01"),
            ),
            factory.lastStream!!.sent,
        )
        gateway.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun setTargetSwitchUsesSwitchAfterSubscribe() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()
        gateway.setTarget("cursor", "sess_01")
        gateway.setTarget("cursor", "sess_02")
        advanceUntilIdle()

        assertEquals(
            listOf(
                SessionStreamClientMessage.Subscribe(agentId = "cursor", sessionId = "sess_01"),
                SessionStreamClientMessage.Switch(agentId = "cursor", sessionId = "sess_02"),
            ),
            factory.lastStream!!.sent,
        )
        gateway.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun emitsStreamResetBeforeResubscribeOnReconnect() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(
                liveThen(DisconnectCause.Retryable("closed")),
                holdOpen(),
            ),
        )
        val gateway = gateway(factory)
        var resets = 0
        val resetsJob = launch {
            gateway.streamResets.collect { resets += 1 }
        }

        gateway.connect(ORIGIN)
        gateway.setTarget("cursor", "sess_01")
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertTrue("expected a stream reset on reconnect", resets >= 1)
        assertEquals(
            SessionStreamClientMessage.Subscribe(agentId = "cursor", sessionId = "sess_01"),
            factory.lastStream!!.sent.single(),
        )
        resetsJob.cancel()
        gateway.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun disconnectStopsTheLoop() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(liveThen(DisconnectCause.Retryable("closed"))),
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        gateway.disconnect()
        advanceUntilIdle()

        assertTrue(factory.openCount <= 1)
        assertEquals(ConnectionStatus.Idle, gateway.state.value.status)
    }

    @Test
    fun coldStartsAgainWhenThePairedServerChanges() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(
                liveThen(DisconnectCause.Protocol("stop")),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val gateway = gateway(factory)

        gateway.connect(ORIGIN)
        advanceUntilIdle()
        gateway.connect("http://192.168.1.20:8787")
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), gateway.state.value.status)
    }

    private fun TestScope.gateway(factory: SessionStreamFactory): DefaultConnectionGateway =
        DefaultConnectionGateway(
            streamFactory = factory,
            scope = this,
        )

    private fun liveThen(cause: DisconnectCause): Script =
        Script.LiveThenClose(cause)

    private fun closedWith(cause: DisconnectCause): Script =
        Script.ImmediateClose(cause)

    private fun holdOpen(): Script = Script.HoldOpen

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private sealed interface Script {
    data class LiveThenClose(val cause: DisconnectCause) : Script
    data class ImmediateClose(val cause: DisconnectCause) : Script
    data object HoldOpen : Script
}

private class ScriptedSessionStreamFactory(
    private val scripts: List<Script>,
    private val now: () -> Long = { 0L },
) : SessionStreamFactory {
    var openCount = 0
        private set
    val openedAt = mutableListOf<Long>()
    var lastStream: ScriptedSessionStream? = null
        private set

    override fun open(serverOrigin: String, handlers: SessionStreamHandlers): SessionStream {
        val index = openCount
        openCount += 1
        openedAt += now()
        val script = scripts.getOrElse(index) { scripts.last() }
        val stream = ScriptedSessionStream(handlers)
        lastStream = stream

        when (script) {
            is Script.ImmediateClose -> handlers.onDisconnect(script.cause)
            is Script.LiveThenClose -> {
                handlers.onOpen()
                handlers.onDisconnect(script.cause)
            }
            Script.HoldOpen -> handlers.onOpen()
        }

        return stream
    }
}

private class ScriptedSessionStream(
    private val handlers: SessionStreamHandlers,
) : SessionStream {
    val sent = mutableListOf<SessionStreamClientMessage>()

    override fun send(message: SessionStreamClientMessage) {
        sent += message
    }

    override fun close() = Unit

    fun emit(message: SessionStreamServerMessage) {
        handlers.onMessage(message)
    }
}
