package server.agent.android.connection

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType
import server.agent.android.events.ConnectionStatus
import server.agent.android.events.DisconnectCause
import server.agent.android.events.EventStream
import server.agent.android.events.EventStreamFactory
import server.agent.android.events.START_CURSOR
import server.agent.android.events.StreamEvent

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultConnectionGatewayTest {
    @Test
    fun coldStartsFromCursorZero() = runTest {
        val stream = ScriptedEventStream(listOf(liveThen(DisconnectCause.Protocol("stop"))))
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(listOf(START_CURSOR), stream.cursors)
    }

    @Test
    fun reconnectsFromTheLastAppliedCursor() = runTest {
        val stream = ScriptedEventStream(
            listOf(
                listOf(
                    StreamEvent.Open,
                    StreamEvent.Frame(frameOf("1", "2", "3")),
                    StreamEvent.Closed(DisconnectCause.Retryable("closed")),
                ),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(listOf("0", "3"), stream.cursors)
        assertEquals("3", gateway.state.value.cursor)
    }

    @Test
    fun doesNotReapplyDuplicateCursorsAfterAReconnect() = runTest {
        val stream = ScriptedEventStream(
            listOf(
                listOf(
                    StreamEvent.Open,
                    StreamEvent.Frame(frameOf("1", "2")),
                    StreamEvent.Closed(DisconnectCause.Retryable("closed")),
                ),
                listOf(
                    StreamEvent.Open,
                    StreamEvent.Frame(frameOf("1", "2", "3")),
                    StreamEvent.Closed(DisconnectCause.Protocol("stop")),
                ),
            ),
        )
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals("3", gateway.state.value.cursor)
        assertEquals(3, gateway.state.value.appliedEvents)
    }

    @Test
    fun backsOffExponentiallyWithoutJitter() = runTest {
        val stream = ScriptedEventStream(
            scripts = List(4) { closedWith(DisconnectCause.Retryable("refused")) } +
                listOf(closedWith(DisconnectCause.Protocol("stop"))),
            now = { testScheduler.currentTime },
        )
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(listOf(0L, 250L, 750L, 1_750L, 3_750L), stream.connectedAt)
    }

    @Test
    fun restartsTheBackoffScheduleOnceASocketOpens() = runTest {
        val stream = ScriptedEventStream(
            scripts = listOf(
                closedWith(DisconnectCause.Retryable("refused")),
                closedWith(DisconnectCause.Retryable("refused")),
                liveThen(DisconnectCause.Retryable("closed")),
                closedWith(DisconnectCause.Retryable("refused")),
                closedWith(DisconnectCause.Protocol("stop")),
            ),
            now = { testScheduler.currentTime },
        )
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(listOf(0L, 250L, 750L, 1_000L, 1_500L), stream.connectedAt)
    }

    @Test
    fun stopsAutoRetryOnUnauthorizedAndKeepsTheCursor() = runTest {
        val stream = ScriptedEventStream(
            listOf(
                listOf(
                    StreamEvent.Open,
                    StreamEvent.Frame(frameOf("9")),
                    StreamEvent.Closed(DisconnectCause.Unauthorized("unauthorized")),
                ),
            ),
        )
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(1, stream.cursors.size)
        assertEquals(ConnectionStatus.AuthFailed(detail = "unauthorized"), gateway.state.value.status)
        assertEquals("9", gateway.state.value.cursor)
    }

    @Test
    fun retryAfterAuthFailureResumesFromTheAppliedCursor() = runTest {
        val stream = ScriptedEventStream(
            listOf(
                listOf(
                    StreamEvent.Open,
                    StreamEvent.Frame(frameOf("9")),
                    StreamEvent.Closed(DisconnectCause.Unauthorized("unauthorized")),
                ),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()
        gateway.retry()
        advanceUntilIdle()

        assertEquals(listOf("0", "9"), stream.cursors)
    }

    @Test
    fun coldStartsAgainWhenThePairedServerChanges() = runTest {
        val stream = ScriptedEventStream(
            listOf(
                listOf(
                    StreamEvent.Open,
                    StreamEvent.Frame(frameOf("1", "2")),
                    StreamEvent.Closed(DisconnectCause.Protocol("stop")),
                ),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()
        gateway.connect("http://192.168.1.20:8787")
        advanceUntilIdle()

        assertEquals(listOf("0", "0"), stream.cursors)
        assertEquals(START_CURSOR, gateway.state.value.cursor)
    }

    @Test
    fun stopsAutoRetryOnContractDrift() = runTest {
        val stream = ScriptedEventStream(listOf(liveThen(DisconnectCause.Protocol("unknown type"))))
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(1, stream.cursors.size)
        assertEquals(ConnectionStatus.TransportError("unknown type"), gateway.state.value.status)
    }

    @Test
    fun keepsReconnectingAfterASlowConsumerClose() = runTest {
        val stream = ScriptedEventStream(
            listOf(
                liveThen(DisconnectCause.Retryable("slow consumer")),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(2, stream.cursors.size)
    }

    @Test
    fun disconnectStopsTheLoop() = runTest {
        val stream = ScriptedEventStream(listOf(liveThen(DisconnectCause.Retryable("closed"))))
        val gateway = gateway(stream)

        gateway.connect(ORIGIN)
        gateway.disconnect()
        advanceUntilIdle()

        assertTrue(stream.cursors.size <= 1)
        assertEquals(ConnectionStatus.Idle, gateway.state.value.status)
    }

    private fun TestScope.gateway(stream: EventStream): DefaultConnectionGateway =
        DefaultConnectionGateway(
            streamFactory = EventStreamFactory { stream },
            scope = this,
        )

    private fun liveThen(cause: DisconnectCause): List<StreamEvent> =
        listOf(StreamEvent.Open, StreamEvent.Closed(cause))

    /** The socket never opened, so the attempt counter keeps climbing. */
    private fun closedWith(cause: DisconnectCause): List<StreamEvent> =
        listOf(StreamEvent.Closed(cause))

    private fun frameOf(vararg cursors: String): List<EventEnvelope> =
        cursors.map { cursor ->
            EventEnvelope(
                type = EventType.DeviceConnected,
                cursor = cursor,
                occurredAt = "2026-08-05T00:00:00.000Z",
                payload = JsonObject(emptyMap()),
            )
        }

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private class ScriptedEventStream(
    private val scripts: List<List<StreamEvent>>,
    private val now: () -> Long = { 0L },
) : EventStream {
    val cursors = mutableListOf<String>()
    val connectedAt = mutableListOf<Long>()

    override fun connect(cursor: String): Flow<StreamEvent> {
        val index = cursors.size
        cursors += cursor
        connectedAt += now()

        return scripts.getOrElse(index) { scripts.last() }.asFlow()
    }
}
