package harold.android.shell

import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentReference
import harold.android.contracts.ItemCollection
import harold.android.contracts.PageInfo
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceState
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.SavedConnection
import harold.android.live.SessionOwner
import harold.android.session.DefaultConnectionGateway
import harold.android.testing.FakeConnectionStore
import harold.android.live.SessionSnapshot
import harold.android.network.WorkspaceApi
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import harold.android.stream.ConnectionState
import harold.android.stream.StreamStatus
import harold.android.testing.FakeConnectionGateway
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
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
    fun connectsTheStreamAndProbesWorkspacesOnceActive() = runTest {
        val connection = FakeSessionOwner()
        val api = FakeAgentApi(Result.success(collectionOf(count = 3)))
        val viewModel = viewModel(active(), connection, api)

        assertEquals(listOf(ORIGIN), connection.connects)
        assertEquals(listOf(ORIGIN to 1), api.calls)
        assertEquals("3 workspaces", viewModel.uiState.value.workspacesSummary)
    }

    @Test
    fun reportsAnEmptyServer() = runTest {
        val api = FakeAgentApi(Result.success(collectionOf(count = 0)))
        val viewModel = viewModel(active(), FakeSessionOwner(), api)

        assertEquals("No workspaces", viewModel.uiState.value.workspacesSummary)
    }

    @Test
    fun reportsAnUnreachableServer() = runTest {
        val api = FakeAgentApi(
            Result.failure(AgentApiException(AgentApiError.Transport(RuntimeException("boom")))),
        )
        val viewModel = viewModel(active(), FakeSessionOwner(), api)

        assertEquals(
            "Workspaces unavailable. Could not reach Harold",
            viewModel.uiState.value.workspacesSummary,
        )
    }

    @Test
    fun mirrorsTheStreamConnectionStatus() = runTest {
        val connection = FakeSessionOwner()
        val viewModel = viewModel(active(), connection, FakeAgentApi(Result.success(collectionOf(1))))

        connection.emit(StreamStatus.Live)
        assertEquals("Live", viewModel.uiState.value.connectionStatus)

        connection.emit(StreamStatus.Reconnecting(attempt = 2))
        assertEquals("Reconnecting (attempt 2)", viewModel.uiState.value.connectionStatus)

        connection.emit(StreamStatus.TransportError("boom"))
        assertEquals("Transport error. boom", viewModel.uiState.value.connectionStatus)
        assertTrue(viewModel.uiState.value.retryVisible)
    }

    @Test
    fun retryReconnectsAndReprobes() = runTest {
        val connection = FakeSessionOwner()
        val api = FakeAgentApi(Result.success(collectionOf(count = 1)))
        val viewModel = viewModel(active(), connection, api)

        connection.emit(StreamStatus.TransportError("timeout"))
        viewModel.onRetryClick()

        assertEquals(1, connection.retries)
        assertEquals(listOf(ORIGIN to 1, ORIGIN to 1), api.calls)
    }

    @Test
    fun forwardsLifecycleForegroundAndBackgroundSignals() = runTest {
        val connection = FakeSessionOwner()
        val viewModel = viewModel(
            active(),
            connection,
            FakeAgentApi(Result.success(collectionOf(1))),
        )

        viewModel.onBackground()
        viewModel.onForeground()

        assertEquals(1, connection.backgroundMarks)
        assertEquals(1, connection.foregroundProbes)
    }

    @Test
    fun stopsTheStreamWhenThereIsNoConnection() = runTest {
        val connection = FakeSessionOwner()
        val viewModel = viewModel(
            FakeConnectionGateway(ActiveConnectionState.NoConnection),
            connection,
            FakeAgentApi(Result.success(collectionOf(1))),
        )

        assertEquals(1, connection.disconnects)
        assertTrue(connection.connects.isEmpty())
        assertEquals("No connections yet", viewModel.uiState.value.status)
    }

    @Test
    fun activeColdStartChoosesChatOnce() = runTest {
        val navigator = harold.android.navigation.Navigator()
        viewModel(
            active(),
            FakeSessionOwner(),
            FakeAgentApi(Result.success(collectionOf(1))),
            navigator,
        )

        assertEquals(listOf(harold.android.navigation.Chat), navigator.backStack.toList())
    }

    @Test
    fun noConnectionColdStartChoosesShell() = runTest {
        val navigator = harold.android.navigation.Navigator()
        viewModel(
            FakeConnectionGateway(ActiveConnectionState.NoConnection),
            FakeSessionOwner(),
            FakeAgentApi(Result.success(collectionOf(1))),
            navigator,
        )

        assertEquals(listOf(harold.android.navigation.Shell), navigator.backStack.toList())
    }

    @Test
    fun startStaysEmptyUntilRefreshResolves() = runTest {
        val dispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(dispatcher)
        val release = kotlinx.coroutines.CompletableDeferred<Unit>()
        val navigator = harold.android.navigation.Navigator()
        viewModel(
            GatedConnectionGateway(
                release = release,
                resolved = ActiveConnectionState.Active(ORIGIN, "Pixel"),
            ),
            FakeSessionOwner(),
            FakeAgentApi(Result.success(collectionOf(1))),
            navigator,
        )

        assertTrue(navigator.backStack.isEmpty())

        release.complete(Unit)
        dispatcher.scheduler.advanceUntilIdle()

        assertEquals(listOf(harold.android.navigation.Chat), navigator.backStack.toList())
    }

    @Test
    fun removingOneHaroldKeepsTheOtherSaved() = runTest {
        val store = FakeConnectionStore()
        store.save(savedConnection("ssh://gary@laptop.local:22", "laptop"))
        store.save(savedConnection("ssh://gary@desktop.local:22", "desktop"))
        val gateway = DefaultConnectionGateway(credentialStore = store)
        val connection = FakeSessionOwner()
        viewModel(
            gateway,
            connection,
            FakeAgentApi(Result.success(collectionOf(1))),
            savedConnections = ConnectionRepository(store),
        )

        assertEquals(
            listOf("ssh://gary@laptop.local:22", "ssh://gary@desktop.local:22"),
            store.list().map { connection -> connection.connectionId },
        )
        assertEquals(
            ActiveConnectionState.Active("ssh://gary@laptop.local:22", "Pixel"),
            gateway.activeConnection.value,
        )
    }

    private fun viewModel(
        session: ConnectionGateway,
        connection: SessionOwner,
        api: WorkspaceApi,
        navigator: harold.android.navigation.Navigator = harold.android.navigation.Navigator(),
        savedConnections: ConnectionRepository = ConnectionRepository(FakeConnectionStore()),
    ): ShellViewModel = ShellViewModel(
        connectionGateway = session,
        sessionOwner = connection,
        agentApi = api,
        navigator = navigator,
    )

    private fun active(): FakeConnectionGateway =
        FakeConnectionGateway(ActiveConnectionState.Active(ORIGIN, "Pixel"))

    private fun collectionOf(count: Int): WorkspaceCollection =
        ItemCollection(
            items = if (count == 0) {
                emptyList()
            } else {
                listOf(
                    Workspace(
                        id = "ws_01",
                        name = "harold",
                        path = "/tmp/harold",
                        state = WorkspaceState.Available,
                        createdAt = "2026-08-05T00:00:00.000Z",
                        lastUsedAt = "2026-08-05T00:00:00.000Z",
                    ),
                )
            },
            page = PageInfo(limit = 1, count = count),
        )

    private companion object {
        const val ORIGIN = "ssh://gary@127.0.0.1:22"
    }
}

private fun savedConnection(connectionId: String, name: String) = SavedConnection(
    formatVersion = 3,
    connectionId = connectionId,
    deviceName = "Pixel",
    name = name,
    colorId = "ink",
    iconId = "mark",
    ssh = SshConfig(
        host = connectionId,
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)

private class GatedConnectionGateway(
    private val release: kotlinx.coroutines.CompletableDeferred<Unit>,
    private val resolved: ActiveConnectionState,
) : ConnectionGateway {
    private val _activeConnection = MutableStateFlow<ActiveConnectionState>(ActiveConnectionState.NoConnection)
    override val activeConnection: StateFlow<ActiveConnectionState> = _activeConnection.asStateFlow()

    override suspend fun refresh() {
        release.await()
        _activeConnection.value = resolved
    }

    override suspend fun clearLocalAccess() {
        _activeConnection.value = ActiveConnectionState.NoConnection
    }
}

private class FakeSessionOwner : SessionOwner {
    private val _connectionState = MutableStateFlow(ConnectionState())
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _snapshot = MutableStateFlow(SessionSnapshot())
    override val snapshot: StateFlow<SessionSnapshot> = _snapshot.asStateFlow()

    override val sessionTitles: StateFlow<Map<String, String>> =
        MutableStateFlow<Map<String, String>>(emptyMap()).asStateFlow()

    override val promptCompletions: Flow<Unit> = MutableSharedFlow<Unit>().asSharedFlow()

    val connects = mutableListOf<String>()
    var retries = 0
        private set
    var disconnects = 0
        private set
    var foregroundProbes = 0
        private set
    var backgroundMarks = 0
        private set

    fun emit(status: StreamStatus) {
        _connectionState.value = _connectionState.value.copy(status = status)
    }

    override fun connect(connectionId: String) {
        connects += connectionId
    }

    override fun retry() {
        retries += 1
    }

    override fun disconnect() {
        disconnects += 1
    }

    override fun onBackground() {
        backgroundMarks += 1
    }

    override fun onForeground() {
        foregroundProbes += 1
    }

    override fun watch(agentId: AgentId?, sessionId: String?) = Unit

    override suspend fun prompt(text: String, attachments: List<AttachmentReference>): Result<Unit> =
        Result.success(Unit)

    override suspend fun cancel(): Result<Unit> = Result.success(Unit)

    override suspend fun replyPermission(requestId: String, optionId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun replyExtension(requestId: String, result: JsonElement): Result<Unit> =
        Result.success(Unit)

    override fun rememberConfig(
        agentId: AgentId,
        sessionId: String,
        configOptions: List<harold.android.contracts.ConfigOption>,
    ) = Unit

    override fun forget(agentId: AgentId, sessionId: String) = Unit
}

private class FakeAgentApi(
    private val result: Result<WorkspaceCollection>,
) : harold.android.network.WorkspaceApi {
    val calls = mutableListOf<Pair<String, Int>>()

    override suspend fun listWorkspaces(
        connectionId: String,
        limit: Int,
    ): Result<WorkspaceCollection> {
        calls += connectionId to limit

        return result
    }

    override suspend fun listFilesystemDirectories(
        connectionId: String,
        root: String?,
    ): Result<harold.android.contracts.FilesystemDirectoryCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun createFilesystemDirectory(
        connectionId: String,
        body: harold.android.contracts.CreateFilesystemDirectoryBody,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCreated>(
        UnsupportedOperationException("unused"),
    )

    override suspend fun createWorkspace(
        connectionId: String,
        body: harold.android.contracts.CreateWorkspaceBody,
    ): Result<Workspace> = Result.failure(UnsupportedOperationException())
}
