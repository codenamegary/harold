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

    /**
     * The agent or its host transport is not usable right now. The detail is
     * already safe to show to the user: raw causes never travel here.
     */
    data class Unavailable(
        val detail: String,
    ) : AgentApiError
}

class AgentApiException(
    val error: AgentApiError,
) : Exception(
    when (error) {
        is AgentApiError.Problem -> error.detail ?: error.title
        is AgentApiError.Transport -> error.cause.message ?: "Transport error"
        is AgentApiError.Unavailable -> error.detail
    },
    when (error) {
        is AgentApiError.Transport -> error.cause
        else -> null
    },
)
