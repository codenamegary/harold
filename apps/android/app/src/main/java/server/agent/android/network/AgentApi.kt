package server.agent.android.network

import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.CancelSessionResponse
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.PermissionRequestCollection
import server.agent.android.contracts.ResolvePermissionRequestBody
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionCollection
import server.agent.android.contracts.UpdateSessionBody
import server.agent.android.contracts.WorkspaceCollection

sealed interface AgentApiError {
    /** Terminal: the credential is missing, revoked, or rejected. */
    data class Unauthorized(
        val detail: String?,
    ) : AgentApiError

    data class Problem(
        val status: Int,
        val title: String,
        val detail: String?,
    ) : AgentApiError

    data class Decode(
        val cause: Throwable,
    ) : AgentApiError

    data class Transport(
        val cause: Throwable,
    ) : AgentApiError
}

class AgentApiException(
    val error: AgentApiError,
) : Exception()

interface AgentApi {
    suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection>

    suspend fun listSessions(
        serverOrigin: String,
        workspaceId: String? = null,
        limit: Int = 100,
    ): Result<SessionCollection>

    suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection>

    suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse>

    suspend fun selectSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session>

    suspend fun promptSession(
        serverOrigin: String,
        sessionId: String,
        body: server.agent.android.contracts.PromptSessionBody,
    ): Result<server.agent.android.contracts.PromptSessionResponse>

    suspend fun updateSession(
        serverOrigin: String,
        sessionId: String,
        body: UpdateSessionBody,
    ): Result<Session>

    suspend fun cancelSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<CancelSessionResponse>

    suspend fun archiveSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session>

    suspend fun listPendingPermissions(
        serverOrigin: String,
        sessionId: String,
    ): Result<PermissionRequestCollection>

    suspend fun resolvePermission(
        serverOrigin: String,
        sessionId: String,
        requestId: String,
        body: ResolvePermissionRequestBody,
    ): Result<PermissionRequest>
}
