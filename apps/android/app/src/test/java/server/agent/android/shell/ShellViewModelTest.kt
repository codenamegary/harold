package server.agent.android.shell

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import server.agent.android.connection.ConnectionGateway
import server.agent.android.contracts.ItemCollection
import server.agent.android.contracts.PageInfo
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.PermissionRequestCollection
import server.agent.android.contracts.ResolvePermissionRequestBody
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionCollection
import server.agent.android.contracts.WorkspaceCollection
import server.agent.android.contracts.WorkspaceState
import server.agent.android.events.ConnectionState
import server.agent.android.events.ConnectionStatus
import server.agent.android.network.AgentApi
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway

@OptIn(ExperimentalCoroutinesApi::class)
class ShellViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun connectsTheStreamAndProbesWorkspacesOncePaired() = runTest {
        val connection = FakeConnectionGateway()
        val api = FakeAgentApi(Result.success(collectionOf(count = 3)))
        val viewModel = viewModel(paired(), connection, api)

        assertEquals(listOf(ORIGIN), connection.connects)
        assertEquals(listOf(ORIGIN to 1), api.calls)
        assertEquals("3 workspaces", viewModel.uiState.value.workspacesSummary)
    }

    @Test
    fun reportsAnEmptyServer() = runTest {
        val api = FakeAgentApi(Result.success(collectionOf(count = 0)))
        val viewModel = viewModel(paired(), FakeConnectionGateway(), api)

        assertEquals("No workspaces", viewModel.uiState.value.workspacesSummary)
    }

    @Test
    fun reportsAnUnreachableServer() = runTest {
        val api = FakeAgentApi(
            Result.failure(AgentApiException(AgentApiError.Transport(RuntimeException("boom")))),
        )
        val viewModel = viewModel(paired(), FakeConnectionGateway(), api)

        assertEquals(
            "Workspaces unavailable. Could not reach Agent Server",
            viewModel.uiState.value.workspacesSummary,
        )
    }

    @Test
    fun offersRetryWhenTheHttpProbeIsUnauthorized() = runTest {
        val api = FakeAgentApi(
            Result.failure(AgentApiException(AgentApiError.Unauthorized("Authentication required"))),
        )
        val viewModel = viewModel(paired(), FakeConnectionGateway(), api)

        assertTrue(viewModel.uiState.value.retryVisible)
        assertEquals(
            "Workspaces unavailable. Authentication required",
            viewModel.uiState.value.workspacesSummary,
        )
    }

    @Test
    fun mirrorsTheStreamConnectionStatus() = runTest {
        val connection = FakeConnectionGateway()
        val viewModel = viewModel(paired(), connection, FakeAgentApi(Result.success(collectionOf(1))))

        connection.emit(ConnectionStatus.Live)
        assertEquals("Live", viewModel.uiState.value.connectionStatus)

        connection.emit(ConnectionStatus.Reconnecting(attempt = 2))
        assertEquals("Reconnecting (attempt 2)", viewModel.uiState.value.connectionStatus)

        connection.emit(ConnectionStatus.AuthFailed(detail = null))
        assertEquals("Auth failed", viewModel.uiState.value.connectionStatus)
        assertTrue(viewModel.uiState.value.retryVisible)
    }

    @Test
    fun retryReconnectsAndReprobes() = runTest {
        val connection = FakeConnectionGateway()
        val api = FakeAgentApi(Result.success(collectionOf(count = 1)))
        val viewModel = viewModel(paired(), connection, api)

        connection.emit(ConnectionStatus.AuthFailed(detail = null))
        viewModel.onRetryClick()

        assertEquals(1, connection.retries)
        assertEquals(listOf(ORIGIN to 1, ORIGIN to 1), api.calls)
    }

    @Test
    fun stopsTheStreamWhenTheDeviceIsNotPaired() = runTest {
        val connection = FakeConnectionGateway()
        val viewModel = viewModel(
            FakeSessionGateway(PairedState.NotPaired),
            connection,
            FakeAgentApi(Result.success(collectionOf(1))),
        )

        assertEquals(1, connection.disconnects)
        assertTrue(connection.connects.isEmpty())
        assertEquals("Not paired", viewModel.uiState.value.status)
    }

    private fun viewModel(
        session: SessionGateway,
        connection: ConnectionGateway,
        api: AgentApi,
    ): ShellViewModel = ShellViewModel(
        sessionGateway = session,
        connectionGateway = connection,
        agentApi = api,
    )

    private fun paired(): FakeSessionGateway =
        FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel"))

    private fun collectionOf(count: Int): WorkspaceCollection =
        ItemCollection(
            items = if (count == 0) {
                emptyList()
            } else {
                listOf(
                    Workspace(
                        id = "ws_01",
                        name = "agent-server",
                        path = "/tmp/agent-server",
                        state = WorkspaceState.Available,
                        createdAt = "2026-08-05T00:00:00.000Z",
                        lastUsedAt = "2026-08-05T00:00:00.000Z",
                    ),
                )
            },
            page = PageInfo(limit = 1, count = count),
        )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private class FakeSessionGateway(
    initial: PairedState,
) : SessionGateway {
    private val _pairedState = MutableStateFlow(initial)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    override suspend fun refresh() = Unit
}

private class FakeConnectionGateway : ConnectionGateway {
    private val _state = MutableStateFlow(ConnectionState())
    override val state: StateFlow<ConnectionState> = _state.asStateFlow()

    val connects = mutableListOf<String>()
    var retries = 0
        private set
    var disconnects = 0
        private set

    fun emit(status: ConnectionStatus) {
        _state.value = _state.value.copy(status = status)
    }

    override fun connect(serverOrigin: String) {
        connects += serverOrigin
    }

    override fun retry() {
        retries += 1
    }

    override fun disconnect() {
        disconnects += 1
    }
}

private class FakeAgentApi(
    private val result: Result<WorkspaceCollection>,
) : AgentApi {
    val calls = mutableListOf<Pair<String, Int>>()

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> {
        calls += serverOrigin to limit

        return result
    }

    override suspend fun listSessions(
        serverOrigin: String,
        workspaceId: String?,
        limit: Int,
    ): Result<SessionCollection> = Result.failure(UnsupportedOperationException())

    override suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = Result.failure(UnsupportedOperationException())

    override suspend fun selectSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session> = Result.failure(UnsupportedOperationException())

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
    ): Result<Session> = Result.failure(UnsupportedOperationException())

    override suspend fun cancelSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<server.agent.android.contracts.CancelSessionResponse> =
        Result.failure(UnsupportedOperationException())

    override suspend fun archiveSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session> = Result.failure(UnsupportedOperationException())

    override suspend fun listPendingPermissions(
        serverOrigin: String,
        sessionId: String,
    ): Result<PermissionRequestCollection> = Result.failure(UnsupportedOperationException())

    override suspend fun resolvePermission(
        serverOrigin: String,
        sessionId: String,
        requestId: String,
        body: ResolvePermissionRequestBody,
    ): Result<PermissionRequest> = Result.failure(UnsupportedOperationException())
}
