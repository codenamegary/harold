package server.agent.android.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import server.agent.android.contracts.AgentServerJson
import server.agent.android.contracts.AgentSettings
import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.ConflictProblem
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.PromptSessionBody
import server.agent.android.contracts.PromptSessionResponse
import server.agent.android.contracts.InternalProblem
import server.agent.android.contracts.ItemCollection
import server.agent.android.contracts.NotFoundProblem
import server.agent.android.contracts.ProblemDetails
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionCollection
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

    override suspend fun listSessions(
        serverOrigin: String,
        workspaceId: String?,
        limit: Int,
    ): Result<SessionCollection> {
        val query = buildMap {
            put("limit", limit.toString())
            if (workspaceId != null) {
                put("workspaceId", workspaceId)
            }
        }

        return get(
            serverOrigin = serverOrigin,
            pathSegments = "v1/sessions",
            query = query,
        ) { body ->
            json.decodeFromString(ItemCollection.serializer(Session.serializer()), body)
        }
    }

    override suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection> = get(
        serverOrigin = serverOrigin,
        pathSegments = "v1/settings/agents",
        query = emptyMap(),
    ) { body ->
        json.decodeFromString(AgentSettingsCollection.serializer(), body)
    }

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = post(
        serverOrigin = serverOrigin,
        pathSegments = "v1/sessions",
        body = json.encodeToString(CreateSessionBody.serializer(), body),
    ) { responseBody ->
        json.decodeFromString(CreateSessionResponse.serializer(), responseBody)
    }

    override suspend fun selectSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session> = post(
        serverOrigin = serverOrigin,
        pathSegments = "v1/sessions/$sessionId/select",
        body = "{}",
    ) { responseBody ->
        json.decodeFromString(Session.serializer(), responseBody)
    }

    override suspend fun promptSession(
        serverOrigin: String,
        sessionId: String,
        body: PromptSessionBody,
    ): Result<PromptSessionResponse> = post(
        serverOrigin = serverOrigin,
        pathSegments = "v1/sessions/$sessionId/prompt",
        body = json.encodeToString(PromptSessionBody.serializer(), body),
    ) { responseBody ->
        json.decodeFromString(PromptSessionResponse.serializer(), responseBody)
    }

    private suspend fun <T> get(
        serverOrigin: String,
        pathSegments: String,
        query: Map<String, String>,
        decode: (String) -> T,
    ): Result<T> = request(
        serverOrigin = serverOrigin,
        pathSegments = pathSegments,
        query = query,
        method = "GET",
        body = null,
        decode = decode,
    )

    private suspend fun <T> post(
        serverOrigin: String,
        pathSegments: String,
        body: String,
        decode: (String) -> T,
    ): Result<T> = request(
        serverOrigin = serverOrigin,
        pathSegments = pathSegments,
        query = emptyMap(),
        method = "POST",
        body = body,
        decode = decode,
    )

    private suspend fun <T> request(
        serverOrigin: String,
        pathSegments: String,
        query: Map<String, String>,
        method: String,
        body: String?,
        decode: (String) -> T,
    ): Result<T> = withContext(Dispatchers.IO) {
        val url = buildUrl(serverOrigin, pathSegments, query)
            ?: return@withContext failure(
                AgentApiError.Transport(IllegalArgumentException("Invalid server origin")),
            )

        val requestBuilder = Request.Builder().url(url)
        if (body != null) {
            requestBuilder.method(
                method,
                body.toRequestBody(JSON_MEDIA_TYPE),
            )
        } else {
            requestBuilder.method(method, null)
        }

        try {
            client.newCall(requestBuilder.build()).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()

                if (!response.isSuccessful) {
                    return@withContext failure(errorFor(response.code, responseBody))
                }

                try {
                    Result.success(decode(responseBody))
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
        val JSON_MEDIA_TYPE = "application/json".toMediaType()
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
