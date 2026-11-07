package harold.android.network

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.UpdateAgentBody
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.FilesystemDirectoryCreated
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.SessionCollection
import harold.android.contracts.SetSessionWorktreePathBody
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import kotlinx.serialization.json.JsonElement

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

/** Write surface for the host-owned worktree path on a session. */
interface SessionWorktreePathApi {
    suspend fun updateSessionWorktreePath(
        connectionId: String,
        sessionId: String,
        body: SetSessionWorktreePathBody,
    ): Result<Unit> = Result.failure(
        UnsupportedOperationException("worktree path updates are not supported"),
    )
}

private fun unsupported(what: String): UnsupportedOperationException =
    UnsupportedOperationException(what)

/** All surfaces the SSH transport provides for one saved connection. */
interface AgentTransportApi : AgentApi, AttachmentApi, SessionConfigApi, SessionCommandApi, GitApi

interface AgentApi : SessionWorktreePathApi {
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

    suspend fun listSessions(
        connectionId: String,
        cwd: String? = null,
    ): Result<SessionCollection>

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

    /** Closes the agent's live ACP processes; the next session spawns fresh. */
    suspend fun restartAgent(
        connectionId: String,
        agentId: AgentId,
    ): Result<Unit> = Result.failure(unsupported("agent restarts are not supported"))

    /** The live capability handshake of the session, or null before it completes. */
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

/** Upload surface for chat attachments. Workspace-scoped. */
interface AttachmentApi {
    suspend fun uploadAttachment(
        connectionId: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor>

    suspend fun deleteAttachment(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        attachmentId: String,
    ): Result<Unit>
}

/** Write surface for session config options. The session_config frame echoes the result. */
interface SessionConfigApi {
    suspend fun setConfigOption(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit>
}

/**
 * Command surface for the watched session: prompts and cancels go to the
 * active ACP session, permission and elicitation replies go to the session
 * that owns the pending request. Commands are independent of the event
 * stream — each call succeeds or fails on its own.
 */
interface SessionCommandApi {
    suspend fun prompt(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        body: PromptRequestBody,
    ): Result<Unit>

    suspend fun cancel(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit>

    suspend fun replyPermission(
        connectionId: String,
        requestId: String,
        optionId: String,
    ): Result<Unit>

    suspend fun replyExtension(
        connectionId: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit>

    /** Posts the raw ACP elicitation result. */
    suspend fun replyElicitation(
        connectionId: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> = Result.failure(
        UnsupportedOperationException("elicitation replies are not supported"),
    )
}
