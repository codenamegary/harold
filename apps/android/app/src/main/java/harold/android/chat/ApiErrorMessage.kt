package harold.android.chat

import harold.android.network.AgentApiError
import harold.android.network.AgentApiException

fun apiErrorMessage(error: Throwable): String =
    when (val apiError = (error as? AgentApiException)?.error) {
        is AgentApiError.Unauthorized -> apiError.detail ?: "Authentication required"
        is AgentApiError.Problem -> apiError.detail ?: apiError.title
        is AgentApiError.Decode -> "Unexpected response from Harold"
        is AgentApiError.Transport -> "Could not reach Harold"
        null -> error.message ?: "Request failed"
    }
