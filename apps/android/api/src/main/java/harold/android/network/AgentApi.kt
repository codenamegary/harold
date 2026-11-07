package harold.android.network

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettingsCollection
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
