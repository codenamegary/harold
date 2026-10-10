package harold.android.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.HaroldJson
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.ConfigValue
import harold.android.contracts.ConflictProblem
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.InternalProblem
import harold.android.contracts.ItemCollection
import harold.android.contracts.NotFoundProblem
import harold.android.contracts.ProblemDetails
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.Session
import harold.android.contracts.SessionCollection
import harold.android.contracts.UnauthorizedProblem
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection

class DefaultAgentApi(
    private val client: OkHttpClient,
    private val json: Json = HaroldJson,
) : AgentApi, AttachmentApi, SessionConfigApi {
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

    override suspend fun uploadAttachment(
        serverOrigin: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor> = withContext(Dispatchers.IO) {
        val url = buildUrl(
            serverOrigin = serverOrigin,
            pathSegments = "v1/sessions/${request.sessionId}/attachments",
            query = mapOf("agentId" to request.agentId),
        ) ?: return@withContext failure(
            AgentApiError.Transport(IllegalArgumentException("Invalid server origin")),
        )

        val bodyBuilder = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                "file",
                request.fileName,
                request.bytes.toRequestBody(request.mimeType.toMediaType()),
            )
        if (request.kind != null) {
            bodyBuilder.addFormDataPart(
                "kind",
                if (request.kind == AttachmentKind.Image) "image" else "file",
            )
        }

        val httpRequest = Request.Builder()
            .url(url)
            .post(bodyBuilder.build())
            .build()

        try {
            client.newCall(httpRequest).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    return@withContext Result.success(
                        json.decodeFromString(AttachmentDescriptor.serializer(), responseBody),
                    )
                }
                failure(errorFor(response.code, responseBody))
            }
        } catch (error: Throwable) {
            failure(AgentApiError.Transport(error))
        }
    }

    override suspend fun deleteAttachment(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        attachmentId: String,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        val url = buildUrl(
            serverOrigin = serverOrigin,
            pathSegments = "v1/sessions/$sessionId/attachments/$attachmentId",
            query = mapOf("agentId" to agentId),
        ) ?: return@withContext failure(
            AgentApiError.Transport(IllegalArgumentException("Invalid server origin")),
        )

        val httpRequest = Request.Builder()
            .url(url)
            .delete()
            .build()

        try {
            client.newCall(httpRequest).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (response.code == HTTP_NO_CONTENT) {
                    return@withContext Result.success(Unit)
                }
                if (!response.isSuccessful) {
                    return@withContext failure(errorFor(response.code, responseBody))
                }
                Result.success(Unit)
            }
        } catch (error: Throwable) {
            failure(AgentApiError.Transport(error))
        }
    }

    override suspend fun setConfigOption(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit> = request(
        serverOrigin = serverOrigin,
        pathSegments = "v1/sessions/$sessionId/config-options/$configId",
        query = mapOf("agentId" to agentId),
        method = "PUT",
        body = JsonObject(
            mapOf(
                "value" to when (value) {
                    is ConfigValue.Text -> JsonPrimitive(value.value)
                    is ConfigValue.Toggle -> JsonPrimitive(value.value)
                },
            ),
        ).toString(),
        decode = { Unit },
    )

    override suspend fun getRuntimeSettings(serverOrigin: String): Result<RuntimeSettingsView> = get(
        serverOrigin = serverOrigin,
        pathSegments = "v1/settings/runtime",
        query = emptyMap(),
    ) { body ->
        json.decodeFromString(RuntimeSettingsView.serializer(), body)
    }

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ): Result<FilesystemDirectoryCollection> = get(
        serverOrigin = serverOrigin,
        pathSegments = "v1/filesystem/directories",
        query = mapOf("root" to root),
    ) { body ->
        json.decodeFromString(FilesystemDirectoryCollection.serializer(), body)
    }

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = post(
        serverOrigin = serverOrigin,
        pathSegments = "v1/workspaces",
        body = json.encodeToString(CreateWorkspaceBody.serializer(), body),
    ) { responseBody ->
        json.decodeFromString(Workspace.serializer(), responseBody)
    }

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<SessionCollection> {
        val query = buildMap {
            if (cwd != null) {
                put("cwd", cwd)
            }
        }

        return get(
            serverOrigin = serverOrigin,
            pathSegments = "v1/sessions",
            query = query,
        ) { body ->
            json.decodeFromString(SessionCollection.serializer(), body)
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
        json.decodeFromString(Session.serializer(), responseBody)
    }

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuth> = get(
        serverOrigin = serverOrigin,
        pathSegments = "v1/agents/$agentId/auth",
        query = emptyMap(),
    ) { body ->
        json.decodeFromString(AgentAuth.serializer(), body)
    }

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSession> = post(
        serverOrigin = serverOrigin,
        pathSegments = "v1/agents/$agentId/auth/sessions",
        body = "{}",
    ) { responseBody ->
        json.decodeFromString(AgentAuthSession.serializer(), responseBody)
    }

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: AuthSessionAction,
    ): Result<AgentAuthSession> = post(
        serverOrigin = serverOrigin,
        pathSegments = "v1/agents/$agentId/auth/sessions/$sessionId/actions",
        body = json.encodeToString(AuthSessionAction.serializer(), action),
    ) { responseBody ->
        json.decodeFromString(AgentAuthSession.serializer(), responseBody)
    }

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary> = post(
        serverOrigin = serverOrigin,
        pathSegments = "v1/agents/$agentId/auth/logout",
        body = "{}",
    ) { responseBody ->
        json.decodeFromString(AgentAuthSummary.serializer(), responseBody)
    }

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        val url = buildSessionUrl(serverOrigin, sessionId, mapOf("agentId" to agentId))
            ?: return@withContext failure(
                AgentApiError.Transport(IllegalArgumentException("Invalid server origin")),
            )

        val request = Request.Builder()
            .url(url)
            .delete()
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (response.code == HTTP_NO_CONTENT) {
                    return@withContext Result.success(Unit)
                }
                if (!response.isSuccessful) {
                    return@withContext failure(errorFor(response.code, responseBody))
                }
                Result.success(Unit)
            }
        } catch (error: Throwable) {
            failure(AgentApiError.Transport(error))
        }
    }

    override suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        val url = buildUrl(serverOrigin, "v1/devices/$deviceId", emptyMap())
            ?: return@withContext failure(
                AgentApiError.Transport(IllegalArgumentException("Invalid server origin")),
            )

        val request = Request.Builder()
            .url(url)
            .delete()
            .build()

        try {
            client.newCall(request).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (response.code == HTTP_NO_CONTENT) {
                    return@withContext Result.success(Unit)
                }
                if (!response.isSuccessful) {
                    return@withContext failure(errorFor(response.code, responseBody))
                }
                Result.success(Unit)
            }
        } catch (error: Throwable) {
            failure(AgentApiError.Transport(error))
        }
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

    private fun buildSessionUrl(
        serverOrigin: String,
        sessionId: String,
        query: Map<String, String>,
    ): HttpUrl? {
        val base = serverOrigin.trim().trimEnd('/').toHttpUrlOrNull() ?: return null

        return base.newBuilder()
            .addPathSegment("v1")
            .addPathSegment("sessions")
            .addPathSegment(sessionId)
            .apply { query.forEach { (name, value) -> addQueryParameter(name, value) } }
            .build()
    }

    private fun <T> failure(error: AgentApiError): Result<T> =
        Result.failure(AgentApiException(error))

    private companion object {
        const val HTTP_UNAUTHORIZED = 401
        const val HTTP_NO_CONTENT = 204
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
