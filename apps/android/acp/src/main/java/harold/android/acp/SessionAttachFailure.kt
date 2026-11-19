package harold.android.acp

import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentSessionGoneException
import harold.android.stream.DisconnectCause
import harold.android.stream.SessionStatus

/**
 * A transport failure is retryable. Only the agent's own protocol answer, a
 * missing session, or an auth requirement is terminal.
 */
internal fun attachFailureCause(error: Throwable): DisconnectCause = when (error) {
    is AgentSessionGoneException -> DisconnectCause.Gone(
        error.message ?: "Session unavailable.",
    )
    is AgentAuthRequiredException -> DisconnectCause.Unauthorized(error.message)
    is AcpRemoteException -> DisconnectCause.Protocol(error.message ?: "ACP error")
    else -> {
        val message = error.message ?: "Session failed."
        if (isProtocolAttachMessage(message)) {
            DisconnectCause.Protocol(message)
        } else {
            DisconnectCause.Retryable(message)
        }
    }
}

internal fun attachFailureStatus(error: Throwable): SessionStatus =
    when (val cause = attachFailureCause(error)) {
        is DisconnectCause.Gone -> SessionStatus.Gone
        is DisconnectCause.Unauthorized -> SessionStatus.AuthFailed
        is DisconnectCause.Protocol -> SessionStatus.Error
        is DisconnectCause.Retryable -> SessionStatus.Offline
    }

internal fun isRetryableAttachFailure(error: Throwable): Boolean =
    attachFailureCause(error) is DisconnectCause.Retryable

internal fun isRetryableAttachMessage(message: String): Boolean =
    !isProtocolAttachMessage(message)

private fun isProtocolAttachMessage(message: String): Boolean =
    message.contains("does not support") ||
        message.contains("did not return this session")
