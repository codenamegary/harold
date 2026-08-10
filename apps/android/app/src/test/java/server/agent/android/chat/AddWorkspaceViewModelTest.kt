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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import server.agent.android.contracts.CreateWorkspaceBody
import server.agent.android.contracts.FilesystemDirectory
import server.agent.android.contracts.FilesystemDirectoryCollection
import server.agent.android.contracts.LogLevel
import server.agent.android.contracts.RuntimeSettings
import server.agent.android.contracts.RuntimeSettingsEffective
import server.agent.android.contracts.RuntimeSettingsOverrides
import server.agent.android.contracts.RuntimeSettingsView
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection
import server.agent.android.contracts.WorkspaceState
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.operator.OperatorRepository
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway

@OptIn(ExperimentalCoroutinesApi::class)
class AddWorkspaceViewModelTest {
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
    fun loadsAllowedRoots() = runTest(dispatcher) {
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            operatorRepository = FakeAddOperatorRepository(),
        )

        advanceUntilIdle()

        val loaded = viewModel.uiState.value.rootsLoadState as RootsLoadState.Loaded
        assertEquals(listOf("/home/ops/code"), loaded.roots)
    }

    @Test
    fun reportsEmptyRoots() = runTest(dispatcher) {
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            operatorRepository = FakeAddOperatorRepository(allowedRoots = emptyList()),
        )

        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.rootsLoadState is RootsLoadState.Empty)
        assertFalse(viewModel.uiState.value.canSubmit)
    }

    @Test
    fun selectingFolderAutofillsNameAndSubmitCreatesWorkspace() = runTest(dispatcher) {
        val repository = FakeAddOperatorRepository()
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            operatorRepository = repository,
        )

        advanceUntilIdle()

        viewModel.onRootChanged("/home/ops/code")
        advanceUntilIdle()

        viewModel.onFolderChanged("/home/ops/code/agent-server")
        assertEquals("agent-server", viewModel.uiState.value.name)
        assertTrue(viewModel.uiState.value.canSubmit)

        viewModel.submit()
        advanceUntilIdle()

        assertEquals(
            listOf(CreateWorkspaceBody(name = "agent-server", path = "/home/ops/code/agent-server")),
            repository.createCalls,
        )
        assertTrue(viewModel.uiState.value.created)
    }

    @Test
    fun folderSearchFiltersList() = runTest(dispatcher) {
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            operatorRepository = FakeAddOperatorRepository(
                folders = listOf(
                    FilesystemDirectory(name = "agent-server", path = "/home/ops/code/agent-server"),
                    FilesystemDirectory(name = "notes", path = "/home/ops/code/notes"),
                ),
            ),
        )

        advanceUntilIdle()
        viewModel.onRootChanged("/home/ops/code")
        advanceUntilIdle()

        viewModel.onFolderQueryChanged("agent")
        assertEquals(1, viewModel.uiState.value.filteredFolders.size)
        assertEquals("agent-server", viewModel.uiState.value.filteredFolders.single().name)
    }

    @Test
    fun folderLoadErrorBlocksSubmit() = runTest(dispatcher) {
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            operatorRepository = FakeAddOperatorRepository(
                foldersFailure = AgentApiException(AgentApiError.Transport(RuntimeException("boom"))),
            ),
        )

        advanceUntilIdle()
        viewModel.onRootChanged("/home/ops/code")
        advanceUntilIdle()

        viewModel.onNameChanged("manual")
        assertTrue(viewModel.uiState.value.foldersLoadState is FoldersLoadState.Error)
        assertFalse(viewModel.uiState.value.canSubmit)
    }

    private fun fakeSession() =
        AddFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel"))

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

class FolderBasenameTest {
    @Test
    fun extractsLastSegment() {
        assertEquals("agent-server", folderBasename("/home/ops/code/agent-server"))
    }
}

private class AddFakeSessionGateway(
    initial: PairedState,
) : SessionGateway {
    private val _pairedState = MutableStateFlow(initial)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    override suspend fun refresh() = Unit

    override suspend fun clearLocalAccess() {
        _pairedState.value = PairedState.NotPaired
    }
}

private class FakeAddOperatorRepository(
    private val allowedRoots: List<String> = listOf("/home/ops/code"),
    private val folders: List<FilesystemDirectory> = listOf(
        FilesystemDirectory(name = "agent-server", path = "/home/ops/code/agent-server"),
    ),
    private val foldersFailure: Throwable? = null,
) : OperatorRepository {
    val createCalls = mutableListOf<CreateWorkspaceBody>()

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> = Result.failure(UnsupportedOperationException())

    override suspend fun getRuntimeSettings(serverOrigin: String) = Result.success(
        RuntimeSettingsView(
            settings = RuntimeSettings(
                advertisedUrl = null,
                trustedProxies = emptyList(),
                bindHost = "127.0.0.1",
                bindPort = 3847,
                logLevel = LogLevel.Info,
                logPath = null,
                allowedRoots = allowedRoots,
            ),
            restartRequired = false,
            effective = RuntimeSettingsEffective(
                bindHost = "127.0.0.1",
                bindPort = 3847,
                logPath = null,
            ),
            overrides = RuntimeSettingsOverrides(),
        ),
    )

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ): Result<FilesystemDirectoryCollection> {
        foldersFailure?.let { return Result.failure(it) }
        return Result.success(FilesystemDirectoryCollection(items = folders))
    }

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> {
        createCalls += body
        return Result.success(
            Workspace(
                id = "ws_new",
                name = body.name,
                path = body.path,
                state = WorkspaceState.Available,
                createdAt = "2026-08-10T00:00:00.000Z",
                lastUsedAt = "2026-08-10T00:00:00.000Z",
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

    override suspend fun listPendingPermissions(
        serverOrigin: String,
        sessionId: String,
    ): Result<List<server.agent.android.contracts.PermissionRequest>> =
        Result.failure(UnsupportedOperationException())

    override suspend fun resolvePermission(
        serverOrigin: String,
        sessionId: String,
        requestId: String,
        optionId: String,
    ): Result<server.agent.android.contracts.PermissionRequest> =
        Result.failure(UnsupportedOperationException())
}
