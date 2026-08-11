package server.agent.android.operator

import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.CreateWorkspaceBody
import server.agent.android.contracts.FilesystemDirectoryCollection
import server.agent.android.contracts.RuntimeSettingsView
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionCollection
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection

interface OperatorRepository {
    suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int = 100,
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
        workspaceId: String? = null,
        limit: Int = 100,
        cursor: String? = null,
        search: String? = null,
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
        body: server.agent.android.contracts.UpdateSessionBody,
    ): Result<Session>

    suspend fun cancelSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<server.agent.android.contracts.CancelSessionResponse>

    suspend fun archiveSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session>

    suspend fun listPendingPermissions(
        serverOrigin: String,
        sessionId: String,
    ): Result<List<server.agent.android.contracts.PermissionRequest>>

    suspend fun resolvePermission(
        serverOrigin: String,
        sessionId: String,
        requestId: String,
        optionId: String,
    ): Result<server.agent.android.contracts.PermissionRequest>
}
