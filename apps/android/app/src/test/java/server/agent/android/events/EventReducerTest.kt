package server.agent.android.events

import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType

class EventReducerTest {
    @Test
    fun coldStartsAtCursorZero() {
        val state = ConnectionState()

        assertEquals(START_CURSOR, state.cursor)
        assertEquals("0", state.cursor)
        assertEquals(ConnectionStatus.Idle, state.status)
    }

    @Test
    fun movesThroughConnectingToLive() {
        val connecting = reduce(ConnectionState(), ConnectionSignal.ConnectRequested)
        val live = reduce(connecting, ConnectionSignal.Connected)

        assertEquals(ConnectionStatus.Connecting, connecting.status)
        assertEquals(ConnectionStatus.Live, live.status)
    }

    @Test
    fun foldsAnOrderedFrameAndAdvancesTheCursorToTheLastApplied() {
        val state = live().applying(frameOf("1", "2", "3"))

        assertEquals("3", state.cursor)
        assertEquals(3, state.appliedEvents)
    }

    @Test
    fun comparesCursorsNumericallyNotLexicographically() {
        val state = live().applying(frameOf("9")).applying(frameOf("10"))

        assertEquals("10", state.cursor)
        assertEquals(2, state.appliedEvents)
    }

    @Test
    fun ignoresARepeatedFrame() {
        val frame = frameOf("1", "2")
        val once = live().applying(frame)
        val twice = once.applying(frame)

        assertEquals("2", twice.cursor)
        assertEquals(2, twice.appliedEvents)
    }

    @Test
    fun appliesOnlyTheNewTailOfAnOverlappingFrame() {
        val state = live().applying(frameOf("1", "2")).applying(frameOf("2", "3", "4"))

        assertEquals("4", state.cursor)
        assertEquals(4, state.appliedEvents)
    }

    @Test
    fun ignoresCursorsBehindTheAppliedPoint() {
        val state = live().applying(frameOf("5")).applying(frameOf("3"))

        assertEquals("5", state.cursor)
        assertEquals(1, state.appliedEvents)
    }

    @Test
    fun advancesTheCursorOnlyPastEventsItApplied() {
        val state = live().applying(frameOf("1", "2", "3")).applying(frameOf("2"))

        assertEquals("3", state.cursor)
        assertEquals(3, state.appliedEvents)
    }

    @Test
    fun countsReconnectAttemptsOnRetryableDisconnects() {
        val first = reduce(live(), ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))
        val second = reduce(first, ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))

        assertEquals(ConnectionStatus.Reconnecting(attempt = 1), first.status)
        assertEquals(ConnectionStatus.Reconnecting(attempt = 2), second.status)
    }

    @Test
    fun resetsTheAttemptCountAfterASuccessfulReconnect() {
        val dropped = reduce(live(), ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))
        val recovered = reduce(reduce(dropped, ConnectionSignal.ConnectRequested), ConnectionSignal.Connected)
        val droppedAgain =
            reduce(recovered, ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))

        assertEquals(ConnectionStatus.Live, recovered.status)
        assertEquals(ConnectionStatus.Reconnecting(attempt = 1), droppedAgain.status)
    }

    @Test
    fun keepsTheAppliedCursorAcrossAReconnect() {
        val dropped = reduce(
            live().applying(frameOf("1", "2")),
            ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")),
        )

        assertEquals("2", dropped.cursor)
    }

    @Test
    fun treatsUnauthorizedAsTerminalAndKeepsTheCursor() {
        val state = reduce(
            live().applying(frameOf("4")),
            ConnectionSignal.Disconnected(DisconnectCause.Unauthorized("device revoked")),
        )

        assertEquals(ConnectionStatus.AuthFailed(detail = "device revoked"), state.status)
        assertEquals("4", state.cursor)
    }

    @Test
    fun treatsContractDriftAsATransportError() {
        val state = reduce(
            live(),
            ConnectionSignal.Disconnected(DisconnectCause.Protocol("unknown event type")),
        )

        assertEquals(ConnectionStatus.TransportError("unknown event type"), state.status)
    }

    @Test
    fun aSlowConsumerCloseStaysRetryable() {
        val state = reduce(
            live(),
            ConnectionSignal.Disconnected(DisconnectCause.Retryable("slow consumer")),
        )

        assertEquals(ConnectionStatus.Reconnecting(attempt = 1), state.status)
    }

    private fun live(): ConnectionState =
        reduce(reduce(ConnectionState(), ConnectionSignal.ConnectRequested), ConnectionSignal.Connected)

    private fun ConnectionState.applying(frame: List<EventEnvelope>): ConnectionState =
        reduce(this, ConnectionSignal.FrameReceived(frame))

    private fun frameOf(vararg cursors: String): List<EventEnvelope> =
        cursors.map { cursor ->
            EventEnvelope(
                type = EventType.DeviceConnected,
                cursor = cursor,
                occurredAt = "2026-08-05T00:00:00.000Z",
                payload = JsonObject(emptyMap()),
            )
        }
}
