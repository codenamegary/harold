package harold.android.stream

import org.junit.Assert.assertEquals
import org.junit.Test

class ConnectionStateTest {
    @Test
    fun coldStartsIdle() {
        val state = ConnectionState()

        assertEquals(ConnectionStatus.Idle, state.status)
        assertEquals(0, state.attempt)
    }

    @Test
    fun movesThroughConnectingToLive() {
        val connecting = reduce(ConnectionState(), ConnectionSignal.ConnectRequested)
        val live = reduce(connecting, ConnectionSignal.Connected)

        assertEquals(ConnectionStatus.Connecting, connecting.status)
        assertEquals(ConnectionStatus.Live, live.status)
    }

    @Test
    fun countsReconnectAttemptsOnRetryableDisconnects() {
        val first = reduce(live(), ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))
        val second = reduce(first, ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))

        assertEquals(ConnectionStatus.Reconnecting(attempt = 1), first.status)
        assertEquals(ConnectionStatus.Reconnecting(attempt = 2), second.status)
    }

    @Test
    fun keepsTheAttemptCountWhileTheNextConnectIsInFlight() {
        val dropped = reduce(live(), ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))
        val retrying = reduce(dropped, ConnectionSignal.ConnectRequested)
        val droppedAgain =
            reduce(retrying, ConnectionSignal.Disconnected(DisconnectCause.Retryable("closed")))

        assertEquals(ConnectionStatus.Connecting, retrying.status)
        assertEquals(ConnectionStatus.Reconnecting(attempt = 2), droppedAgain.status)
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
    fun treatsUnauthorizedAsTerminal() {
        val state = reduce(
            live(),
            ConnectionSignal.Disconnected(DisconnectCause.Unauthorized("device revoked")),
        )

        assertEquals(ConnectionStatus.AuthFailed(detail = "device revoked"), state.status)
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
}
