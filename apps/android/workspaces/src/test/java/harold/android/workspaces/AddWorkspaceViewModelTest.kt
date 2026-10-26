package harold.android.workspaces

import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectory
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.LogLevel
import harold.android.contracts.RuntimeSettings
import harold.android.contracts.RuntimeSettingsEffective
import harold.android.contracts.RuntimeSettingsOverrides
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceState
import harold.android.navigation.Chat
import harold.android.navigation.Navigator
import harold.android.navigation.Workspaces
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.testing.FakeSessionGateway
import harold.android.user.UserRepository
import harold.android.database.workspace.CachedWorkspace
import harold.android.database.workspace.WorkspaceRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
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
            navigator = Navigator(),
            userRepository = FakeAddUserRepository(),
            workspaceRepository = FakeAddWorkspaceRepository(),
        )

        advanceUntilIdle()

        val loaded = viewModel.uiState.value.rootsLoadState as RootsLoadState.Loaded
        assertEquals(listOf("/home/ops/code"), loaded.roots)
    }

    @Test
    fun reportsEmptyRoots() = runTest(dispatcher) {
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            navigator = Navigator(),
            userRepository = FakeAddUserRepository(allowedRoots = emptyList()),
            workspaceRepository = FakeAddWorkspaceRepository(),
        )

        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.rootsLoadState is RootsLoadState.Empty)
        assertFalse(viewModel.uiState.value.canSubmit)
    }

    @Test
    fun selectingFolderAutofillsNameAndSubmitCreatesWorkspace() = runTest(dispatcher) {
        val repository = FakeAddUserRepository()
        val workspaceRepository = FakeAddWorkspaceRepository()
        val navigator = Navigator()
        navigator.start(paired = true)
        navigator.openWorkspaces()
        navigator.openAddWorkspace()
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            navigator = navigator,
            userRepository = repository,
            workspaceRepository = workspaceRepository,
        )

        advanceUntilIdle()

        viewModel.onRootChanged("/home/ops/code")
        advanceUntilIdle()

        viewModel.onFolderChanged("/home/ops/code/harold")
        assertEquals("harold", viewModel.uiState.value.name)
        assertTrue(viewModel.uiState.value.canSubmit)

        viewModel.submit()
        advanceUntilIdle()

        assertEquals(
            listOf(CreateWorkspaceBody(name = "harold", path = "/home/ops/code/harold")),
            workspaceRepository.createCalls,
        )
        assertEquals(listOf(Chat, Workspaces), navigator.backStack.toList())
    }

    @Test
    fun folderSearchFiltersList() = runTest(dispatcher) {
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            navigator = Navigator(),
            userRepository = FakeAddUserRepository(
                folders = listOf(
                    FilesystemDirectory(name = "harold", path = "/home/ops/code/harold"),
                    FilesystemDirectory(name = "notes", path = "/home/ops/code/notes"),
                ),
            ),
            workspaceRepository = FakeAddWorkspaceRepository(),
        )

        advanceUntilIdle()
        viewModel.onRootChanged("/home/ops/code")
        advanceUntilIdle()

        viewModel.onFolderQueryChanged("har")
        assertEquals(1, viewModel.uiState.value.filteredFolders.size)
        assertEquals("harold", viewModel.uiState.value.filteredFolders.single().name)
    }

    @Test
    fun folderLoadErrorBlocksSubmit() = runTest(dispatcher) {
        val viewModel = AddWorkspaceViewModel(
            sessionGateway = fakeSession(),
            navigator = Navigator(),
            userRepository = FakeAddUserRepository(
                foldersFailure = AgentApiException(AgentApiError.Transport(RuntimeException("boom"))),
            ),
            workspaceRepository = FakeAddWorkspaceRepository(),
        )

        advanceUntilIdle()
        viewModel.onRootChanged("/home/ops/code")
        advanceUntilIdle()

        viewModel.onNameChanged("manual")
        assertTrue(viewModel.uiState.value.foldersLoadState is FoldersLoadState.Error)
        assertFalse(viewModel.uiState.value.canSubmit)
    }

    private fun fakeSession() =
        FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel"))

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

class FolderBasenameTest {
    @Test
    fun extractsLastSegment() {
        assertEquals("harold", folderBasename("/home/ops/code/harold"))
    }
}

private class FakeAddUserRepository(
    private val allowedRoots: List<String> = listOf("/home/ops/code"),
    private val folders: List<FilesystemDirectory> = listOf(
        FilesystemDirectory(name = "harold", path = "/home/ops/code/harold"),
    ),
    private val foldersFailure: Throwable? = null,
) : UserRepository {
    val createCalls = mutableListOf<CreateWorkspaceBody>()

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> = Result.failure(UnsupportedOperationException())

    override suspend fun getRuntimeSettings(serverOrigin: String) = Result.success(
        RuntimeSettingsView(
            settings = RuntimeSettings(
                advertisedUrl = null,
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

private class FakeAddWorkspaceRepository : WorkspaceRepository {
    val createCalls = mutableListOf<CreateWorkspaceBody>()
    private val cached = MutableStateFlow<List<CachedWorkspace>>(emptyList())

    override fun observe(): Flow<List<CachedWorkspace>> = cached

    override fun observe(serverOrigin: String): Flow<List<CachedWorkspace>> = cached

    override suspend fun refresh(serverOrigin: String): Result<Unit> = Result.success(Unit)

    override suspend fun create(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> {
        createCalls += body
        val workspace = Workspace(
            id = "ws_new",
            name = body.name,
            path = body.path,
            state = WorkspaceState.Available,
            createdAt = "2026-08-10T00:00:00.000Z",
            lastUsedAt = "2026-08-10T00:00:00.000Z",
        )
        cached.value = listOf(CachedWorkspace(serverOrigin, workspace))
        return Result.success(workspace)
    }
}
