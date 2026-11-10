package harold.android.stream

import org.junit.Assert.assertEquals
import org.junit.Test

class ConnectionStateTest {
    @Test
    fun coldStartsIdle() {
        val state = ConnectionState()

        assertEquals(StreamStatus.Idle, state.status)
        assertEquals(0, state.attempt)
    }

    @Test
    fun movesThroughConnectingToLive() {
        val connecting = reduce(ConnectionState(), ConnectionSignal.ConnectRequested)
        val live = reduce(connecting, ConnectionSignal.Connected)

        assertEquals(StreamStatus.Connecting, connecting.status)
        assertEquals(StreamStatus.Live, live.status)
    }

    @Test
    fun countsReconnectAttemptsOnRetryableDisconnects() {
        val first = reduce(live(), ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))
        val second = reduce(first, ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))

        assertEquals(StreamStatus.Reconnecting(attempt = 1), first.status)
        assertEquals(StreamStatus.Reconnecting(attempt = 2), second.status)
    }

    @Test
    fun keepsTheAttemptCountWhileTheNextConnectIsInFlight() {
        val dropped = reduce(live(), ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))
        val retrying = reduce(dropped, ConnectionSignal.ConnectRequested)
        val droppedAgain =
            reduce(retrying, ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))

        assertEquals(StreamStatus.Connecting, retrying.status)
        assertEquals(StreamStatus.Reconnecting(attempt = 2), droppedAgain.status)
    }

    @Test
    fun resetsTheAttemptCountAfterASuccessfulReconnect() {
        val dropped = reduce(live(), ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))
        val recovered = reduce(reduce(dropped, ConnectionSignal.ConnectRequested), ConnectionSignal.Connected)
        val droppedAgain =
            reduce(recovered, ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))

        assertEquals(StreamStatus.Live, recovered.status)
        assertEquals(StreamStatus.Reconnecting(attempt = 1), droppedAgain.status)
    }

    @Test
    fun parksIdleWhenAsked() {
        val state = reduce(live(), ConnectionSignal.Idle)

        assertEquals(StreamStatus.Idle, state.status)
    }

    @Test
    fun treatsUnauthorizedAsTerminal() {
        val state = reduce(
            live(),
            ConnectionSignal.Disconnected(DisconnectCause.Unauthorized("device revoked")),
        )

        assertEquals(StreamStatus.AuthFailed(detail = "device revoked"), state.status)
    }

    @Test
    fun treatsContractDriftAsATransportError() {
        val state = reduce(
            live(),
            ConnectionSignal.Disconnected(DisconnectCause.Protocol("unknown event type")),
        )

        assertEquals(StreamStatus.TransportError("unknown event type"), state.status)
    }

    @Test
    fun aSlowConsumerCloseStaysRetryable() {
        val state = reduce(
            live(),
            ConnectionSignal.Disconnected(DisconnectCause.Retryable("slow consumer")),
        )

        assertEquals(StreamStatus.Reconnecting(attempt = 1), state.status)
    }

    private fun live(): ConnectionState =
        reduce(reduce(ConnectionState(), ConnectionSignal.ConnectRequested), ConnectionSignal.Connected)
}
