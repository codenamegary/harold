package server.agent.android.events

import server.agent.android.contracts.EventFrame

/** Cold start. The journal replays everything after this cursor. */
const val START_CURSOR = "0"

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
    val cursor: String = START_CURSOR,
    val appliedEvents: Int = 0,
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

    data class FrameReceived(
        val frame: EventFrame,
    ) : ConnectionSignal

    data class Disconnected(
        val cause: DisconnectCause,
    ) : ConnectionSignal
}

fun reduce(state: ConnectionState, signal: ConnectionSignal): ConnectionState =
    when (signal) {
        ConnectionSignal.ConnectRequested -> state.copy(status = ConnectionStatus.Connecting)

        ConnectionSignal.Connected -> state.copy(status = ConnectionStatus.Live)

        is ConnectionSignal.FrameReceived -> state.applyFrame(signal.frame)

        is ConnectionSignal.Disconnected -> when (val cause = signal.cause) {
            is DisconnectCause.Unauthorized ->
                state.copy(status = ConnectionStatus.AuthFailed(detail = cause.detail))

            is DisconnectCause.Protocol ->
                state.copy(status = ConnectionStatus.TransportError(message = cause.message))

            is DisconnectCause.Retryable ->
                state.copy(status = ConnectionStatus.Reconnecting(attempt = state.nextAttempt()))
        }
    }

/**
 * Applies each event whose cursor is ahead of the applied point, then moves the
 * cursor. Anything at or behind the cursor is a replay of work already folded in,
 * so a duplicate frame is a no-op.
 */
private fun ConnectionState.applyFrame(frame: EventFrame): ConnectionState {
    var cursorValue = cursor.cursorValue()
    var applied = 0

    frame.forEach { envelope ->
        val next = envelope.cursor.cursorValue()

        if (next > cursorValue) {
            applied += 1
            cursorValue = next
        }
    }

    if (applied == 0) {
        return this
    }

    return copy(
        cursor = cursorValue.toString(),
        appliedEvents = appliedEvents + applied,
    )
}

private fun ConnectionState.nextAttempt(): Int =
    when (val current = status) {
        is ConnectionStatus.Reconnecting -> current.attempt + 1
        else -> 1
    }

/** Cursors are canonical non-negative integers. `-1` sorts behind every real cursor. */
private fun String.cursorValue(): Long = toLongOrNull() ?: -1L
