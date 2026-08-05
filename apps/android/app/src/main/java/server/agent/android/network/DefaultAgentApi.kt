package server.agent.android.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import server.agent.android.contracts.AgentServerJson
import server.agent.android.contracts.ConflictProblem
import server.agent.android.contracts.InternalProblem
import server.agent.android.contracts.ItemCollection
import server.agent.android.contracts.NotFoundProblem
import server.agent.android.contracts.ProblemDetails
import server.agent.android.contracts.UnauthorizedProblem
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection

class DefaultAgentApi(
    private val client: OkHttpClient,
    private val json: Json = AgentServerJson,
) : AgentApi {
    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> = get(
        serverOrigin = serverOrigin,
        pathSegments = "v1/workspaces",
        query = mapOf("limit" to limit.toString()),
    ) { body ->
        json.decodeFromString(ItemCollection.serializer(Workspace.serializer()), body)
    }

    private suspend fun <T> get(
        serverOrigin: String,
        pathSegments: String,
        query: Map<String, String>,
        decode: (String) -> T,
    ): Result<T> = withContext(Dispatchers.IO) {
        val url = buildUrl(serverOrigin, pathSegments, query)
            ?: return@withContext failure(
                AgentApiError.Transport(IllegalArgumentException("Invalid server origin")),
            )

        try {
            client.newCall(Request.Builder().url(url).get().build()).execute().use { response ->
                val body = response.body?.string().orEmpty()

                if (!response.isSuccessful) {
                    return@withContext failure(errorFor(response.code, body))
                }

                try {
                    Result.success(decode(body))
                } catch (error: Throwable) {
                    failure(AgentApiError.Decode(error))
                }
            }
        } catch (error: Throwable) {
            failure(AgentApiError.Transport(error))
        }
    }

    private fun errorFor(status: Int, body: String): AgentApiError {
        val problem = runCatching {
            json.decodeFromString(ProblemDetails.serializer(), body)
        }.getOrNull()

        if (status == HTTP_UNAUTHORIZED) {
            return AgentApiError.Unauthorized(detail = problem?.detailOrNull())
        }

        return AgentApiError.Problem(
            status = status,
            title = problem?.title ?: "Request failed",
            detail = problem?.detailOrNull(),
        )
    }

    private fun buildUrl(
        serverOrigin: String,
        pathSegments: String,
        query: Map<String, String>,
    ): HttpUrl? {
        val base = serverOrigin.trim().trimEnd('/').toHttpUrlOrNull() ?: return null

        return base.newBuilder()
            .addPathSegments(pathSegments)
            .apply { query.forEach { (name, value) -> addQueryParameter(name, value) } }
            .build()
    }

    private fun <T> failure(error: AgentApiError): Result<T> =
        Result.failure(AgentApiException(error))

    private companion object {
        const val HTTP_UNAUTHORIZED = 401
    }
}

private fun ProblemDetails.detailOrNull(): String? =
    when (this) {
        is UnauthorizedProblem -> detail
        is NotFoundProblem -> detail
        is ConflictProblem -> detail
        is InternalProblem -> detail
        else -> null
    }
