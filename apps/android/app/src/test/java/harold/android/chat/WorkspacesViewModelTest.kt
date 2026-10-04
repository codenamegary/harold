package harold.android.chat

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import harold.android.contracts.ItemCollection
import harold.android.contracts.PageInfo
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceState
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.operator.OperatorRepository
import harold.android.session.PairedState
import harold.android.session.SessionGateway

@OptIn(ExperimentalCoroutinesApi::class)
class WorkspacesViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun loadsWorkspaces() = runTest(dispatcher) {
        val viewModel = WorkspacesViewModel(
            sessionGateway = WorkspacesFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            operatorRepository = WorkspacesFakeOperatorRepository(),
        )

        viewModel.refresh()
        advanceUntilIdle()

        val loaded = viewModel.uiState.value.loadState as WorkspacesLoadState.Loaded
        assertEquals(1, loaded.workspaces.size)
        assertEquals(WorkspaceState.Available, loaded.workspaces.single().state)
    }

    @Test
    fun reportsEmptyWorkspaces() = runTest(dispatcher) {
        val viewModel = WorkspacesViewModel(
            sessionGateway = WorkspacesFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            operatorRepository = WorkspacesFakeOperatorRepository(workspaces = emptyList()),
        )

        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.loadState is WorkspacesLoadState.Empty)
    }

    @Test
    fun reportsApiFailure() = runTest(dispatcher) {
        val viewModel = WorkspacesViewModel(
            sessionGateway = WorkspacesFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            operatorRepository = WorkspacesFakeOperatorRepository(
                apiFailure = AgentApiException(AgentApiError.Transport(RuntimeException("boom"))),
            ),
        )

        viewModel.refresh()
        advanceUntilIdle()

        val error = viewModel.uiState.value.loadState as WorkspacesLoadState.Error
        assertEquals("Could not reach Harold", error.message)
    }

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private class WorkspacesFakeSessionGateway(
    initial: PairedState,
) : SessionGateway {
    private val _pairedState = MutableStateFlow(initial)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    override suspend fun refresh() = Unit

    override suspend fun clearLocalAccess() {
        _pairedState.value = PairedState.NotPaired
    }
}

private class WorkspacesFakeOperatorRepository(
    private val workspaces: List<Workspace> = listOf(
        Workspace(
            id = "ws_01",
            name = "harold",
            path = "/tmp/harold",
            state = WorkspaceState.Available,
            createdAt = "2026-08-05T00:00:00.000Z",
            lastUsedAt = "2026-08-05T00:00:00.000Z",
        ),
    ),
    private val apiFailure: Throwable? = null,
) : OperatorRepository {
    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> {
        apiFailure?.let { return Result.failure(it) }

        return Result.success(
            WorkspaceCollection(
                items = workspaces,
                page = PageInfo(limit = limit, count = workspaces.size),
            ),
        )
    }

    override suspend fun getRuntimeSettings(serverOrigin: String) =
        Result.failure<harold.android.contracts.RuntimeSettingsView>(UnsupportedOperationException())

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCollection>(
        UnsupportedOperationException(),
    )

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: harold.android.contracts.CreateWorkspaceBody,
    ) = Result.failure<Workspace>(UnsupportedOperationException())

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<harold.android.contracts.SessionCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun listAgents(serverOrigin: String): Result<harold.android.contracts.AgentSettingsCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun createSession(
        serverOrigin: String,
        body: harold.android.contracts.CreateSessionBody,
    ): Result<harold.android.contracts.CreateSessionResponse> =
        Result.failure(UnsupportedOperationException())

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: harold.android.contracts.AgentId,
        sessionId: String,
    ): Result<Unit> = Result.failure(UnsupportedOperationException())

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: harold.android.contracts.AgentId,
    ): Result<harold.android.contracts.AgentAuth> =
        Result.failure(UnsupportedOperationException())

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: harold.android.contracts.AgentId,
    ): Result<harold.android.contracts.AgentAuthSession> =
        Result.failure(UnsupportedOperationException())

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: harold.android.contracts.AgentId,
        sessionId: String,
        action: harold.android.contracts.AuthSessionAction,
    ): Result<harold.android.contracts.AgentAuthSession> =
        Result.failure(UnsupportedOperationException())

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: harold.android.contracts.AgentId,
    ): Result<harold.android.contracts.AgentAuthSummary> =
        Result.failure(UnsupportedOperationException())

    override suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ): Result<Unit> = Result.success(Unit)
}
