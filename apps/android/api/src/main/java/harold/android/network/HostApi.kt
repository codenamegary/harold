package harold.android.network

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.FilesystemDirectoryCreated
import harold.android.contracts.UpdateAgentBody
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection

/** Workspace and filesystem surface for one saved connection. */
interface WorkspaceApi {
    suspend fun listWorkspaces(
        connectionId: String,
        limit: Int,
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

    /**
     * Forgets the workspace bookmark and hides its folder from session
     * directory hints. The folder itself is untouched.
     */
    suspend fun deleteWorkspace(
        connectionId: String,
        path: String,
    ): Result<Unit> = Result.failure(unsupported("workspace removal is not supported"))
}

/** Agent catalog and settings surface for one saved connection. */
interface AgentSettingsApi {
    suspend fun listAgents(connectionId: String): Result<AgentSettingsCollection>

    /** Probes the host for every known agent and merges the results into agents.json. */
    suspend fun scanAgents(
        connectionId: String,
    ): Result<AgentSettingsCollection> = Result.failure(unsupported("agent scans are not supported"))

    /** Edits the user-owned fields of one agent row. */
    suspend fun updateAgent(
        connectionId: String,
        agentId: AgentId,
        body: UpdateAgentBody,
    ): Result<AgentSettings> = Result.failure(unsupported("agent updates are not supported"))

    /** Adds a custom agent the catalog does not know about. */
    suspend fun createCustomAgent(
        connectionId: String,
        body: CreateCustomAgentBody,
    ): Result<AgentSettings> = Result.failure(unsupported("custom agents are not supported"))

    /**
     * Removes an agent from the list: known agents keep a dismissal
     * tombstone so rescans do not resurrect them, custom agents are deleted.
     */
    suspend fun deleteAgent(
        connectionId: String,
        agentId: AgentId,
    ): Result<Unit> = Result.failure(unsupported("agent removal is not supported"))

    /** Re-reads the host's shared config and drops in-memory caches. */
    suspend fun reloadConfig(
        connectionId: String,
    ): Result<AgentSettingsCollection> = Result.failure(unsupported("config reloads are not supported"))
}

/** Host-side agent sign-in surface. Sign-in itself always happens on the host. */
interface AgentAuthApi {
    suspend fun getAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuth>

    suspend fun logoutAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary>
}

/** Everything host state and git expose for one saved connection. */
interface HostApi : WorkspaceApi, AgentSettingsApi, AgentAuthApi, AttachmentApi, GitApi

private fun unsupported(what: String): UnsupportedOperationException =
    UnsupportedOperationException(what)
