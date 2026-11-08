package harold.android.network

sealed interface AgentApiError {
    data class Problem(
        val status: Int,
        val title: String,
        val detail: String?,
    ) : AgentApiError

    data class Transport(
        val cause: Throwable,
    ) : AgentApiError
}

class AgentApiException(
    val error: AgentApiError,
) : Exception(
    when (error) {
        is AgentApiError.Problem -> error.detail ?: error.title
        is AgentApiError.Transport -> error.cause.message ?: "Transport error"
    },
    when (error) {
        is AgentApiError.Transport -> error.cause
        else -> null
    },
)
