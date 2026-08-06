package server.agent.android.chat

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
import server.agent.android.contracts.ItemCollection
import server.agent.android.contracts.PageInfo
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection
import server.agent.android.contracts.WorkspaceState
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.operator.OperatorRepository
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway

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

        advanceUntilIdle()

        val error = viewModel.uiState.value.loadState as WorkspacesLoadState.Error
        assertEquals("Could not reach Agent Server", error.message)
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
}

private class WorkspacesFakeOperatorRepository(
    private val workspaces: List<Workspace> = listOf(
        Workspace(
            id = "ws_01",
            name = "agent-server",
            path = "/tmp/agent-server",
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

    override suspend fun listSessions(
        serverOrigin: String,
        workspaceId: String?,
        limit: Int,
    ): Result<server.agent.android.contracts.SessionCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun listAgents(serverOrigin: String): Result<server.agent.android.contracts.AgentSettingsCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun createSession(
        serverOrigin: String,
        body: server.agent.android.contracts.CreateSessionBody,
    ): Result<server.agent.android.contracts.CreateSessionResponse> =
        Result.failure(UnsupportedOperationException())

    override suspend fun selectSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<server.agent.android.contracts.Session> =
        Result.failure(UnsupportedOperationException())

    override suspend fun promptSession(
        serverOrigin: String,
        sessionId: String,
        body: server.agent.android.contracts.PromptSessionBody,
    ): Result<server.agent.android.contracts.PromptSessionResponse> =
        Result.failure(UnsupportedOperationException())

    override suspend fun updateSession(
        serverOrigin: String,
        sessionId: String,
        body: server.agent.android.contracts.UpdateSessionBody,
    ): Result<server.agent.android.contracts.Session> =
        Result.failure(UnsupportedOperationException())

    override suspend fun cancelSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<server.agent.android.contracts.CancelSessionResponse> =
        Result.failure(UnsupportedOperationException())

    override suspend fun archiveSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<server.agent.android.contracts.Session> =
        Result.failure(UnsupportedOperationException())
}
