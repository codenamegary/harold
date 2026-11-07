package harold.android.stream

sealed interface StreamStatus {
    data object Idle : StreamStatus

    data object Connecting : StreamStatus

    data object Live : StreamStatus

    data class Reconnecting(
        val attempt: Int,
    ) : StreamStatus

    /** Terminal. Auto-retry stops until the user asks for it. */
    data class AuthFailed(
        val detail: String?,
    ) : StreamStatus

    /** Terminal. The server said something this build cannot decode. */
    data class TransportError(
        val message: String,
    ) : StreamStatus
}

data class ConnectionState(
    val status: StreamStatus = StreamStatus.Idle,
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

    /** No session is watched, so no stream can open. Not a connection attempt. */
    data object Idle : ConnectionSignal

    data class Disconnected(
        val cause: DisconnectCause,
    ) : ConnectionSignal
}

fun reduce(state: ConnectionState, signal: ConnectionSignal): ConnectionState =
    when (signal) {
        ConnectionSignal.ConnectRequested -> state.copy(status = StreamStatus.Connecting)

        ConnectionSignal.Connected -> state.copy(status = StreamStatus.Live, attempt = 0)

        ConnectionSignal.Idle -> state.copy(status = StreamStatus.Idle, attempt = 0)

        is ConnectionSignal.Disconnected -> when (val cause = signal.cause) {
            is DisconnectCause.Unauthorized ->
                state.copy(status = StreamStatus.AuthFailed(detail = cause.detail))

            is DisconnectCause.Protocol ->
                state.copy(status = StreamStatus.TransportError(message = cause.message))

            is DisconnectCause.Retryable -> state.copy(
                status = StreamStatus.Reconnecting(attempt = state.attempt + 1),
                attempt = state.attempt + 1,
            )
        }
    }
