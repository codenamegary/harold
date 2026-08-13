package server.agent.android.events

sealed interface ConnectionStatus {
    data object Idle : ConnectionStatus

    data object Connecting : ConnectionStatus

    data object Live : ConnectionStatus

    data class Reconnecting(
        val attempt: Int,
    ) : ConnectionStatus

    /** Terminal. Auto-retry stops until the operator asks for it. */
    data class AuthFailed(
        val detail: String?,
    ) : ConnectionStatus

    /** Terminal. The server said something this build cannot decode. */
    data class TransportError(
        val message: String,
    ) : ConnectionStatus
}

data class ConnectionState(
    val status: ConnectionStatus = ConnectionStatus.Idle,
    /** Consecutive failed connects. Survives `Connecting` so backoff keeps growing. */
    val attempt: Int = 0,
)

sealed interface DisconnectCause {
    data class Unauthorized(
        val detail: String?,
    ) : DisconnectCause

    data class Retryable(
        val message: String,
    ) : DisconnectCause

    data class Protocol(
        val message: String,
    ) : DisconnectCause
}

sealed interface ConnectionSignal {
    data object ConnectRequested : ConnectionSignal

    data object Connected : ConnectionSignal

    data class Disconnected(
        val cause: DisconnectCause,
    ) : ConnectionSignal
}

fun reduce(state: ConnectionState, signal: ConnectionSignal): ConnectionState =
    when (signal) {
        ConnectionSignal.ConnectRequested -> state.copy(status = ConnectionStatus.Connecting)

        ConnectionSignal.Connected -> state.copy(status = ConnectionStatus.Live, attempt = 0)

        is ConnectionSignal.Disconnected -> when (val cause = signal.cause) {
            is DisconnectCause.Unauthorized ->
                state.copy(status = ConnectionStatus.AuthFailed(detail = cause.detail))

            is DisconnectCause.Protocol ->
                state.copy(status = ConnectionStatus.TransportError(message = cause.message))

            is DisconnectCause.Retryable -> state.copy(
                status = ConnectionStatus.Reconnecting(attempt = state.attempt + 1),
                attempt = state.attempt + 1,
            )
        }
    }
