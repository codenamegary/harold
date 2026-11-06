package harold.android.transport.routing

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.FilesystemDirectoryCreated
import harold.android.contracts.GitChanges
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktreeCollection
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.SessionCollection
import harold.android.contracts.SetSessionWorktreePathBody
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.credentials.HaroldTransport
import harold.android.credentials.SavedHaroldRepository
import harold.android.network.AgentTransportApi
import harold.android.network.DefaultAgentApi
import harold.android.transport.direct.SshAgentApi
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonElement

/**
 * One API surface for both transports. The saved connection's transport is
 * the only routing input; callers keep passing the roster id they already have.
 */
@Singleton
class RoutingAgentApi @Inject constructor(
    private val http: DefaultAgentApi,
    private val ssh: SshAgentApi,
    private val savedHarolds: SavedHaroldRepository,
) : AgentTransportApi {
    private suspend fun apiFor(connectionId: String): AgentTransportApi =
        when (savedHarolds.find(connectionId)?.transport) {
            HaroldTransport.Ssh -> ssh
            else -> http
        }

    override suspend fun listWorkspaces(serverOrigin: String, limit: Int): Result<WorkspaceCollection> =
        apiFor(serverOrigin).listWorkspaces(serverOrigin, limit)

    override suspend fun getRuntimeSettings(serverOrigin: String): Result<RuntimeSettingsView> =
        apiFor(serverOrigin).getRuntimeSettings(serverOrigin)

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String?,
    ): Result<FilesystemDirectoryCollection> =
        apiFor(serverOrigin).listFilesystemDirectories(serverOrigin, root)

    override suspend fun createFilesystemDirectory(
        serverOrigin: String,
        body: CreateFilesystemDirectoryBody,
    ): Result<FilesystemDirectoryCreated> =
        apiFor(serverOrigin).createFilesystemDirectory(serverOrigin, body)

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = apiFor(serverOrigin).createWorkspace(serverOrigin, body)

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<SessionCollection> = apiFor(serverOrigin).listSessions(serverOrigin, cwd)

    override suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection> =
        apiFor(serverOrigin).listAgents(serverOrigin)

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = apiFor(serverOrigin).createSession(serverOrigin, body)

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = apiFor(serverOrigin).deleteSession(serverOrigin, agentId, sessionId)

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuth> = apiFor(serverOrigin).getAgentAuth(serverOrigin, agentId)

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSession> = apiFor(serverOrigin).startAgentAuthSession(serverOrigin, agentId)

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: AuthSessionAction,
    ): Result<AgentAuthSession> =
        apiFor(serverOrigin).applyAgentAuthSessionAction(serverOrigin, agentId, sessionId, action)

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary> = apiFor(serverOrigin).logoutAgentAuth(serverOrigin, agentId)

    override suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ): Result<Unit> = apiFor(serverOrigin).revokeDevice(serverOrigin, deviceId)

    override suspend fun prompt(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        body: PromptRequestBody,
    ): Result<Unit> = apiFor(serverOrigin).prompt(serverOrigin, agentId, sessionId, body)

    override suspend fun cancel(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = apiFor(serverOrigin).cancel(serverOrigin, agentId, sessionId)

    override suspend fun replyPermission(
        serverOrigin: String,
        requestId: String,
        optionId: String,
    ): Result<Unit> = apiFor(serverOrigin).replyPermission(serverOrigin, requestId, optionId)

    override suspend fun replyExtension(
        serverOrigin: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> = apiFor(serverOrigin).replyExtension(serverOrigin, requestId, result)

    override suspend fun replyElicitation(
        serverOrigin: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> = apiFor(serverOrigin).replyElicitation(serverOrigin, requestId, result)

    override suspend fun setConfigOption(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit> =
        apiFor(serverOrigin).setConfigOption(serverOrigin, agentId, sessionId, configId, value)

    override suspend fun uploadAttachment(
        serverOrigin: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor> = apiFor(serverOrigin).uploadAttachment(serverOrigin, request)

    override suspend fun deleteAttachment(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        attachmentId: String,
    ): Result<Unit> =
        apiFor(serverOrigin).deleteAttachment(serverOrigin, agentId, sessionId, attachmentId)

    override suspend fun getSummary(serverOrigin: String, path: String): Result<GitSummary> =
        apiFor(serverOrigin).getSummary(serverOrigin, path)

    override suspend fun listWorktrees(
        serverOrigin: String,
        path: String,
    ): Result<GitWorktreeCollection> = apiFor(serverOrigin).listWorktrees(serverOrigin, path)

    override suspend fun getChanges(
        serverOrigin: String,
        path: String,
        scope: GitScope,
    ): Result<GitChanges> = apiFor(serverOrigin).getChanges(serverOrigin, path, scope)

    override suspend fun getFileDiff(
        serverOrigin: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String?,
    ): Result<GitFileDiff> =
        apiFor(serverOrigin).getFileDiff(serverOrigin, worktreePath, scope, filePath, oldPath)

    override suspend fun updateSessionWorktreePath(
        serverOrigin: String,
        sessionId: String,
        body: SetSessionWorktreePathBody,
    ): Result<Unit> =
        apiFor(serverOrigin).updateSessionWorktreePath(serverOrigin, sessionId, body)
}
