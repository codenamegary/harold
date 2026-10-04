package harold.android.network

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection

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
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit>

    suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuth>

    suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSession>

    suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: AuthSessionAction,
    ): Result<AgentAuthSession>

    suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary>

    /** Soft-revokes this device on the server (DELETE /v1/devices/{id}). */
    suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ): Result<Unit>
}

/** Upload surface for chat attachments. Workspace-scoped, server-validated. */
interface AttachmentApi {
    suspend fun uploadAttachment(
        serverOrigin: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor>

    suspend fun deleteAttachment(
        serverOrigin: String,
        workspaceId: String,
        attachmentId: String,
    ): Result<Unit>
}

/** Write surface for session config options. The session_config frame echoes the result. */
interface SessionConfigApi {
    suspend fun setConfigOption(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit>
}
