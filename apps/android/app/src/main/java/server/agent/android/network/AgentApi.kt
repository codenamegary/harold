package server.agent.android.network

import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.CreateWorkspaceBody
import server.agent.android.contracts.FilesystemDirectoryCollection
import server.agent.android.contracts.RuntimeSettingsView
import server.agent.android.contracts.SessionCollection
import server.agent.android.contracts.Workspace
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

    suspend fun getRuntimeSettings(serverOrigin: String): Result<RuntimeSettingsView>

    suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ): Result<FilesystemDirectoryCollection>

    suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace>

    suspend fun listSessions(
        serverOrigin: String,
        cwd: String? = null,
    ): Result<SessionCollection>

    suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection>

    suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse>

    suspend fun deleteSession(
        serverOrigin: String,
        agentId: server.agent.android.contracts.AgentId,
        sessionId: String,
    ): Result<Unit>
}
