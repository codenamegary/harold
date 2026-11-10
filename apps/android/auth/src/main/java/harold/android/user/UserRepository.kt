package harold.android.user

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.UpdateAgentBody
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.FilesystemDirectoryCreated
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection

interface UserRepository {
    suspend fun listWorkspaces(
        connectionId: String,
        limit: Int = 100,
    ): Result<WorkspaceCollection>

    suspend fun listFilesystemDirectories(
        connectionId: String,
        root: String? = null,
    ): Result<FilesystemDirectoryCollection>

    suspend fun createFilesystemDirectory(
        connectionId: String,
        body: CreateFilesystemDirectoryBody,
    ): Result<FilesystemDirectoryCreated>

    suspend fun createWorkspace(
        connectionId: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace>

    suspend fun listSessions(
        connectionId: String,
        cwd: String? = null,
    ): Result<SessionCollection>

    suspend fun listAgents(connectionId: String): Result<AgentSettingsCollection>

    suspend fun scanAgents(
        connectionId: String,
    ): Result<AgentSettingsCollection> = Result.failure(unsupported("agent scans are not supported"))

    suspend fun updateAgent(
        connectionId: String,
        agentId: AgentId,
        body: UpdateAgentBody,
    ): Result<AgentSettings> = Result.failure(unsupported("agent updates are not supported"))

    suspend fun createCustomAgent(
        connectionId: String,
        body: CreateCustomAgentBody,
    ): Result<AgentSettings> = Result.failure(unsupported("custom agents are not supported"))

    suspend fun deleteAgent(
        connectionId: String,
        agentId: AgentId,
    ): Result<Unit> = Result.failure(unsupported("agent removal is not supported"))

    suspend fun reloadConfig(
        connectionId: String,
    ): Result<AgentSettingsCollection> = Result.failure(unsupported("config reloads are not supported"))

    suspend fun restartAgent(
        connectionId: String,
        agentId: AgentId,
    ): Result<Unit> = Result.failure(unsupported("agent restarts are not supported"))

    suspend fun getAgentCapabilities(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<AgentCapabilityInventory?> = Result.failure(
        unsupported("capability lookups are not supported"),
    )

    suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse>

    suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit>

    suspend fun getAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuth>

    suspend fun logoutAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary>
}

private fun unsupported(what: String): UnsupportedOperationException =
    UnsupportedOperationException(what)
