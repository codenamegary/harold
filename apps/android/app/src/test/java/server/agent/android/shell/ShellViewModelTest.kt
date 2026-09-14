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
import kotlinx.serialization.json.JsonElement
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AttachmentReference
import server.agent.android.contracts.ItemCollection
import server.agent.android.contracts.PageInfo
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection
import server.agent.android.contracts.WorkspaceState
import server.agent.android.stream.ConnectionState
import server.agent.android.stream.ConnectionStatus
import server.agent.android.live.SessionOwner
import server.agent.android.live.SessionSnapshot
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
        val connection = FakeSessionOwner()
        val api = FakeAgentApi(Result.success(collectionOf(count = 3)))
        val viewModel = viewModel(paired(), connection, api)

        assertEquals(listOf(ORIGIN), connection.connects)
        assertEquals(listOf(ORIGIN to 1), api.calls)
        assertEquals("3 workspaces", viewModel.uiState.value.workspacesSummary)
    }

    @Test
    fun reportsAnEmptyServer() = runTest {
        val api = FakeAgentApi(Result.success(collectionOf(count = 0)))
        val viewModel = viewModel(paired(), FakeSessionOwner(), api)

        assertEquals("No workspaces", viewModel.uiState.value.workspacesSummary)
    }

    @Test
    fun reportsAnUnreachableServer() = runTest {
        val api = FakeAgentApi(
            Result.failure(AgentApiException(AgentApiError.Transport(RuntimeException("boom")))),
        )
        val viewModel = viewModel(paired(), FakeSessionOwner(), api)

        assertEquals(
            "Workspaces unavailable. Could not reach Agent Server",
            viewModel.uiState.value.workspacesSummary,
        )
    }

    @Test
    fun clearsLocalAccessWhenTheHttpProbeIsUnauthorized() = runTest {
        val session = paired()
        val api = FakeAgentApi(
            Result.failure(AgentApiException(AgentApiError.Unauthorized("Authentication required"))),
        )
        val viewModel = viewModel(session, FakeSessionOwner(), api)

        assertEquals(1, session.clearLocalAccessCount)
        assertEquals(PairedState.NotPaired, session.pairedState.value)
        assertEquals("Not paired", viewModel.uiState.value.status)
    }

    @Test
    fun mirrorsTheStreamConnectionStatus() = runTest {
        val connection = FakeSessionOwner()
        val viewModel = viewModel(paired(), connection, FakeAgentApi(Result.success(collectionOf(1))))

        connection.emit(ConnectionStatus.Live)
        assertEquals("Live", viewModel.uiState.value.connectionStatus)

        connection.emit(ConnectionStatus.Reconnecting(attempt = 2))
        assertEquals("Reconnecting (attempt 2)", viewModel.uiState.value.connectionStatus)

        connection.emit(ConnectionStatus.TransportError("boom"))
        assertEquals("Transport error. boom", viewModel.uiState.value.connectionStatus)
        assertTrue(viewModel.uiState.value.retryVisible)
    }

    @Test
    fun clearsLocalAccessWhenTheStreamRejectsTheCredential() = runTest {
        val session = paired()
        val connection = FakeSessionOwner()
        val viewModel = viewModel(session, connection, FakeAgentApi(Result.success(collectionOf(1))))

        connection.emit(ConnectionStatus.AuthFailed(detail = "Device revoked"))

        assertEquals(1, session.clearLocalAccessCount)
        assertEquals(PairedState.NotPaired, session.pairedState.value)
        assertEquals("Not paired", viewModel.uiState.value.status)
        assertEquals(1, connection.disconnects)
    }

    @Test
    fun retryReconnectsAndReprobes() = runTest {
        val connection = FakeSessionOwner()
        val api = FakeAgentApi(Result.success(collectionOf(count = 1)))
        val viewModel = viewModel(paired(), connection, api)

        connection.emit(ConnectionStatus.TransportError("timeout"))
        viewModel.onRetryClick()

        assertEquals(1, connection.retries)
        assertEquals(listOf(ORIGIN to 1, ORIGIN to 1), api.calls)
    }

    @Test
    fun stopsTheStreamWhenTheDeviceIsNotPaired() = runTest {
        val connection = FakeSessionOwner()
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
        connection: SessionOwner,
        api: AgentApi,
    ): ShellViewModel = ShellViewModel(
        sessionGateway = session,
        sessionOwner = connection,
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

    var clearLocalAccessCount = 0
        private set

    override suspend fun refresh() = Unit

    override suspend fun clearLocalAccess() {
        clearLocalAccessCount += 1
        _pairedState.value = PairedState.NotPaired
    }
}

private class FakeSessionOwner : SessionOwner {
    private val _connectionState = MutableStateFlow(ConnectionState())
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _snapshot = MutableStateFlow(SessionSnapshot())
    override val snapshot: StateFlow<SessionSnapshot> = _snapshot.asStateFlow()

    val connects = mutableListOf<String>()
    var retries = 0
        private set
    var disconnects = 0
        private set

    fun emit(status: ConnectionStatus) {
        _connectionState.value = _connectionState.value.copy(status = status)
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

    override fun watch(agentId: AgentId?, sessionId: String?) = Unit

    override fun prompt(text: String, attachments: List<AttachmentReference>) = Unit

    override fun cancel() = Unit

    override fun replyPermission(requestId: String, optionId: String) = Unit

    override fun replyExtension(requestId: String, result: JsonElement) = Unit

    override fun forget(agentId: AgentId, sessionId: String) = Unit
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


    override suspend fun getRuntimeSettings(
        serverOrigin: String,
    ): Result<server.agent.android.contracts.RuntimeSettingsView> =
        Result.failure(UnsupportedOperationException())

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ): Result<server.agent.android.contracts.FilesystemDirectoryCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: server.agent.android.contracts.CreateWorkspaceBody,
    ): Result<Workspace> = Result.failure(UnsupportedOperationException())

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<server.agent.android.contracts.SessionCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun listAgents(serverOrigin: String): Result<server.agent.android.contracts.AgentSettingsCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun createSession(
        serverOrigin: String,
        body: server.agent.android.contracts.CreateSessionBody,
    ): Result<server.agent.android.contracts.CreateSessionResponse> =
        Result.failure(UnsupportedOperationException())

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: server.agent.android.contracts.AgentId,
        sessionId: String,
    ): Result<Unit> = Result.failure(UnsupportedOperationException())

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: server.agent.android.contracts.AgentId,
    ): Result<server.agent.android.contracts.AgentAuth> =
        Result.failure(UnsupportedOperationException())

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: server.agent.android.contracts.AgentId,
    ): Result<server.agent.android.contracts.AgentAuthSession> =
        Result.failure(UnsupportedOperationException())

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: server.agent.android.contracts.AgentId,
        sessionId: String,
        action: server.agent.android.contracts.AuthSessionAction,
    ): Result<server.agent.android.contracts.AgentAuthSession> =
        Result.failure(UnsupportedOperationException())

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: server.agent.android.contracts.AgentId,
    ): Result<server.agent.android.contracts.AgentAuthSummary> =
        Result.failure(UnsupportedOperationException())

    override suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ): Result<Unit> = Result.success(Unit)
}
