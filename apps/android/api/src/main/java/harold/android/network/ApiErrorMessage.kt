package harold.android.network

fun apiErrorMessage(error: Throwable): String =
    when (val apiError = (error as? AgentApiException)?.error) {
        is AgentApiError.Problem -> apiError.detail ?: apiError.title
        is AgentApiError.Transport -> "Could not reach Harold"
        null -> error.message ?: "Request failed"
    }
