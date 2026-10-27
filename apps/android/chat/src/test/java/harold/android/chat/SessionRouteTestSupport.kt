package harold.android.chat

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.ItemCollection
import harold.android.contracts.PageInfo
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.Session
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.navigation.Navigator
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.testing.FakeSessionGateway
import harold.android.user.UserRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emptyFlow

internal class RecordingSessionCommands : SessionCommands {
    val emitted = mutableListOf<SessionCommand>()
    override val commands: Flow<SessionCommand> = emptyFlow()

    override fun emit(command: SessionCommand) {
        emitted += command
    }
}

internal class RouteUserRepository(
    private val workspaces: List<Workspace> = emptyList(),
    private val sessions: List<Session> = emptyList(),
    private val agents: List<AgentSettings> = emptyList(),
    private val createResult: Result<CreateSessionResponse> = Result.failure(
        IllegalStateException("create was not stubbed"),
    ),
    private val authStatus: AgentAuthStatus = AgentAuthStatus.Authenticated,
    private val deleteResult: Result<Unit> = Result.success(Unit),
) : UserRepository {
    val deleted = mutableListOf<String>()

    override suspend fun listWorkspaces(serverOrigin: String, limit: Int): Result<WorkspaceCollection> =
        Result.success(page(workspaces))

    override suspend fun getRuntimeSettings(serverOrigin: String): Result<RuntimeSettingsView> =
        unsupported()

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String?,
    ): Result<FilesystemDirectoryCollection> = unsupported()

    override suspend fun createFilesystemDirectory(
        serverOrigin: String,
        body: harold.android.contracts.CreateFilesystemDirectoryBody,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCreated>(
        UnsupportedOperationException("unused"),
    )

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = unsupported()

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<SessionCollection> = Result.success(SessionCollection(sessions))

    override suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection> =
        Result.success(AgentSettingsCollection(agents))

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = createResult

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> {
        deleted += sessionId
        return deleteResult
    }

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuth> = Result.success(
        AgentAuth(agentId = agentId, status = authStatus, error = null, session = null),
    )

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSession> = unsupported()

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: AuthSessionAction,
    ): Result<AgentAuthSession> = unsupported()

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary> = unsupported()

    override suspend fun revokeDevice(serverOrigin: String, deviceId: String): Result<Unit> =
        Result.success(Unit)

    private fun <T> unsupported(): Result<T> = Result.failure(UnsupportedOperationException())

    private fun <T> page(items: List<T>): ItemCollection<T> = ItemCollection(
        items = items,
        page = PageInfo(limit = 100, count = items.size),
    )
}

internal fun testNavigator(): Navigator {
    val navigator = Navigator()
    navigator.start(paired = true)
    return navigator
}
