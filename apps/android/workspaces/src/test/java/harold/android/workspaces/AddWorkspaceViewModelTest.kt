package harold.android.workspaces

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectory
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.FilesystemDirectoryCreated
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceSource
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
    fun loadsHomeBrowserOnInit() = runTest(dispatcher) {
        val userRepository = FakeAddUserRepository()
        val viewModel = makeViewModel(userRepository = userRepository)

        advanceUntilIdle()

        assertEquals(listOf<String?>(null), userRepository.listCalls)
        val browser = viewModel.uiState.value.browserLoadState as BrowserLoadState.Loaded
        assertEquals("/home/ops", browser.path)
        assertEquals("/home", browser.parent)
        assertEquals(listOf("harold"), browser.folders.map { it.name })
    }

    @Test
    fun drillingIntoAFolderLoadsThatPath() = runTest(dispatcher) {
        val userRepository = FakeAddUserRepository(
            byRoot = mapOf(
                "/home/ops/code" to FilesystemDirectoryCollection(
                    path = "/home/ops/code",
                    parent = "/home/ops",
                    items = listOf(FilesystemDirectory("harold", "/home/ops/code/harold")),
                ),
            ),
        )
        val viewModel = makeViewModel(userRepository = userRepository)

        advanceUntilIdle()
        viewModel.onFolderSelected("/home/ops/code")
        advanceUntilIdle()

        assertEquals(listOf(null, "/home/ops/code"), userRepository.listCalls)
        assertEquals("/home/ops/code", viewModel.uiState.value.browserPath)
        assertEquals("/home/ops", viewModel.uiState.value.browserParent)
    }

    @Test
    fun browserUpLoadsTheParentFolder() = runTest(dispatcher) {
        val userRepository = FakeAddUserRepository(
            byRoot = mapOf(
                "/home/ops/code" to FilesystemDirectoryCollection(
                    path = "/home/ops/code",
                    parent = "/home/ops",
                    items = emptyList(),
                ),
            ),
        )
        val viewModel = makeViewModel(userRepository = userRepository)

        advanceUntilIdle()
        viewModel.onFolderSelected("/home/ops/code")
        advanceUntilIdle()
        viewModel.onBrowserUp()
        advanceUntilIdle()

        assertEquals(listOf(null, "/home/ops/code", "/home/ops"), userRepository.listCalls)
        assertEquals("/home/ops", viewModel.uiState.value.browserPath)
    }

    @Test
    fun folderSearchFiltersTheLoadedFolders() = runTest(dispatcher) {
        val viewModel = makeViewModel(
            userRepository = FakeAddUserRepository(
                home = FilesystemDirectoryCollection(
                    path = "/home/ops",
                    parent = "/home",
                    items = listOf(
                        FilesystemDirectory("harold", "/home/ops/harold"),
                        FilesystemDirectory("notes", "/home/ops/notes"),
                    ),
                ),
            ),
        )

        advanceUntilIdle()
        viewModel.onFolderQueryChanged("har")

        assertEquals(1, viewModel.uiState.value.filteredFolders.size)
        assertEquals("harold", viewModel.uiState.value.filteredFolders.single().name)
    }

    @Test
    fun browserErrorBlocksSubmit() = runTest(dispatcher) {
        val viewModel = makeViewModel(
            userRepository = FakeAddUserRepository(
                browserFailure = AgentApiException(AgentApiError.Transport(RuntimeException("boom"))),
            ),
        )

        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.browserLoadState is BrowserLoadState.Error)
        assertFalse(viewModel.uiState.value.canSubmit)
    }

    @Test
    fun openModeSelectsTheCurrentFolderAndCreatesAFolderWorkspace() = runTest(dispatcher) {
        val userRepository = FakeAddUserRepository(
            byRoot = mapOf(
                "/home/ops/code" to FilesystemDirectoryCollection(
                    path = "/home/ops/code",
                    parent = "/home/ops",
                    items = emptyList(),
                ),
            ),
        )
        val workspaceRepository = FakeAddWorkspaceRepository()
        val navigator = openAddWorkspace()

        val viewModel = makeViewModel(
            userRepository = userRepository,
            workspaceRepository = workspaceRepository,
            navigator = navigator,
        )

        advanceUntilIdle()
        viewModel.onFolderSelected("/home/ops/code")
        advanceUntilIdle()
        viewModel.onUseCurrentFolder()

        assertEquals("/home/ops/code", viewModel.uiState.value.selectedFolderPath)
        assertEquals("code", viewModel.uiState.value.name)
        assertTrue(viewModel.uiState.value.canSubmit)

        viewModel.submit()
        advanceUntilIdle()

        assertEquals(
            listOf(
                CreateWorkspaceBody(
                    source = WorkspaceSource.Folder,
                    path = "/home/ops/code",
                    name = "code",
                ),
            ),
            workspaceRepository.createCalls,
        )
        assertEquals(listOf(Chat, Workspaces), navigator.backStack.toList())
    }

    @Test
    fun cloneUrlPrefillsTheFolderNameAndFinalPath() = runTest(dispatcher) {
        val viewModel = makeViewModel()

        advanceUntilIdle()
        viewModel.onModeChanged(AddWorkspaceMode.CloneRepo)
        viewModel.onUseCurrentFolder()
        viewModel.onCloneUrlChanged("git@github.com:acme/widgets.git")

        val state = viewModel.uiState.value
        assertEquals("widgets", state.cloneFolderName)
        assertEquals("widgets", state.name)
        assertEquals("/home/ops", state.cloneParent)
        assertEquals("/home/ops/widgets", state.finalPath)
        assertTrue(state.canSubmit)
    }

    @Test
    fun cloneCreatesTheFolderBeforeRegisteringTheWorkspace() = runTest(dispatcher) {
        val events = mutableListOf<String>()
        val userRepository = FakeAddUserRepository(
            events = events,
            createDirectoryResult = { body ->
                Result.success(
                    FilesystemDirectoryCreated(
                        name = body.name,
                        path = joinFolderPath(body.parent, body.name),
                    ),
                )
            },
        )
        val workspaceRepository = FakeAddWorkspaceRepository(events = events)
        val navigator = openAddWorkspace()

        val viewModel = makeViewModel(
            userRepository = userRepository,
            workspaceRepository = workspaceRepository,
            navigator = navigator,
        )

        advanceUntilIdle()
        viewModel.onModeChanged(AddWorkspaceMode.CloneRepo)
        viewModel.onUseCurrentFolder()
        viewModel.onCloneUrlChanged("https://github.com/acme/widgets.git")
        viewModel.submit()
        advanceUntilIdle()

        assertEquals(
            listOf(CreateFilesystemDirectoryBody(parent = "/home/ops", name = "widgets")),
            userRepository.createDirectoryCalls,
        )
        assertEquals(
            listOf(
                CreateWorkspaceBody(
                    source = WorkspaceSource.Git,
                    path = "/home/ops/widgets",
                    name = "widgets",
                    url = "https://github.com/acme/widgets.git",
                ),
            ),
            workspaceRepository.createCalls,
        )
        assertEquals(listOf("mkdir", "create"), events)
        assertEquals(listOf(Chat, Workspaces), navigator.backStack.toList())
    }

    @Test
    fun mkdirFailureDoesNotCreateTheWorkspace() = runTest(dispatcher) {
        val events = mutableListOf<String>()
        val userRepository = FakeAddUserRepository(
            events = events,
            createDirectoryResult = {
                Result.failure(
                    AgentApiException(
                        AgentApiError.Problem(
                            status = 409,
                            title = "Directory already exists",
                            detail = "A directory with that name already exists in the parent folder",
                        ),
                    ),
                )
            },
        )
        val workspaceRepository = FakeAddWorkspaceRepository(events = events)

        val viewModel = makeViewModel(
            userRepository = userRepository,
            workspaceRepository = workspaceRepository,
        )

        advanceUntilIdle()
        viewModel.onModeChanged(AddWorkspaceMode.CloneRepo)
        viewModel.onUseCurrentFolder()
        viewModel.onCloneUrlChanged("https://github.com/acme/widgets.git")
        viewModel.submit()
        advanceUntilIdle()

        assertTrue(workspaceRepository.createCalls.isEmpty())
        assertEquals(listOf("mkdir"), events)
        assertTrue(
            viewModel.uiState.value.submitError.orEmpty().contains("already exists"),
        )
        assertFalse(viewModel.uiState.value.submitting)
    }

    @Test
    fun failedCloneMentionsTheDestinationAndPartialFiles() = runTest(dispatcher) {
        val userRepository = FakeAddUserRepository()
        val workspaceRepository = FakeAddWorkspaceRepository(
            failure = AgentApiException(
                AgentApiError.Problem(
                    status = 422,
                    title = "Git clone failed",
                    detail = "Clone failed for /home/ops/widgets: repository not found",
                ),
            ),
        )

        val viewModel = makeViewModel(
            userRepository = userRepository,
            workspaceRepository = workspaceRepository,
        )

        advanceUntilIdle()
        viewModel.onModeChanged(AddWorkspaceMode.CloneRepo)
        viewModel.onUseCurrentFolder()
        viewModel.onCloneUrlChanged("https://github.com/acme/missing.git")
        viewModel.submit()
        advanceUntilIdle()

        val message = viewModel.uiState.value.submitError.orEmpty()
        assertTrue(message.contains("/home/ops/widgets"))
        assertTrue(message.contains("Partial files may remain"))
    }

    @Test
    fun newFolderIsCreatedUnderTheBrowserPathAndSelected() = runTest(dispatcher) {
        val userRepository = FakeAddUserRepository(
            createDirectoryResult = { body ->
                Result.success(
                    FilesystemDirectoryCreated(
                        name = body.name,
                        path = joinFolderPath(body.parent, body.name),
                    ),
                )
            },
        )
        val viewModel = makeViewModel(userRepository = userRepository)

        advanceUntilIdle()
        viewModel.createFolder("widgets")
        advanceUntilIdle()

        assertEquals(
            listOf(CreateFilesystemDirectoryBody(parent = "/home/ops", name = "widgets")),
            userRepository.createDirectoryCalls,
        )
        assertEquals("/home/ops/widgets", viewModel.uiState.value.selectedFolderPath)
        assertEquals("widgets", viewModel.uiState.value.name)
        assertEquals("/home/ops/widgets", viewModel.uiState.value.browserPath)
    }

    @Test
    fun newFolderInCloneModeBecomesTheParent() = runTest(dispatcher) {
        val viewModel = makeViewModel()

        advanceUntilIdle()
        viewModel.onModeChanged(AddWorkspaceMode.CloneRepo)
        viewModel.createFolder("clones")
        advanceUntilIdle()

        assertEquals("/home/ops/clones", viewModel.uiState.value.cloneParent)
    }

    @Test
    fun emptyNameBlocksSubmit() = runTest(dispatcher) {
        val viewModel = makeViewModel()

        advanceUntilIdle()
        viewModel.onUseCurrentFolder()
        assertTrue(viewModel.uiState.value.canSubmit)

        viewModel.onNameChanged("")
        assertFalse(viewModel.uiState.value.canSubmit)
    }

    private fun makeViewModel(
        userRepository: UserRepository = FakeAddUserRepository(),
        workspaceRepository: WorkspaceRepository = FakeAddWorkspaceRepository(),
        navigator: Navigator = Navigator(),
    ) = AddWorkspaceViewModel(
        sessionGateway = fakeSession(),
        navigator = navigator,
        userRepository = userRepository,
        workspaceRepository = workspaceRepository,
    )

    private fun openAddWorkspace(): Navigator {
        val navigator = Navigator()
        navigator.start(paired = true)
        navigator.openWorkspaces()
        navigator.openAddWorkspace()
        return navigator
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

    @Test
    fun fallsBackToThePathForRoot() {
        assertEquals("/", workspaceNameForPath("/"))
    }
}

class FolderNameFromUrlTest {
    @Test
    fun derivesFromCommonCloneUrls() {
        assertEquals("widgets", folderNameFromUrl("https://github.com/acme/widgets.git"))
        assertEquals("widgets", folderNameFromUrl("git@github.com:acme/widgets.git"))
        assertEquals("widgets", folderNameFromUrl("ssh://git@example.com/acme/widgets"))
    }

    @Test
    fun returnsEmptyForAHostOnlyUrl() {
        assertEquals("", folderNameFromUrl("https://github.com/"))
    }
}

private fun parentOf(folderPath: String): String? {
    if (folderPath == "/") {
        return null
    }
    return folderPath.substringBeforeLast('/', missingDelimiterValue = "").ifEmpty { "/" }
}

private class FakeAddUserRepository(
    private val home: FilesystemDirectoryCollection = FilesystemDirectoryCollection(
        path = "/home/ops",
        parent = "/home",
        items = listOf(FilesystemDirectory("harold", "/home/ops/harold")),
    ),
    private val byRoot: Map<String, FilesystemDirectoryCollection> = emptyMap(),
    private val browserFailure: Throwable? = null,
    private val events: MutableList<String> = mutableListOf(),
    private val createDirectoryResult: (CreateFilesystemDirectoryBody) -> Result<FilesystemDirectoryCreated> = { body ->
        Result.success(
            FilesystemDirectoryCreated(
                name = body.name,
                path = joinFolderPath(body.parent, body.name),
            ),
        )
    },
) : UserRepository {
    val listCalls = mutableListOf<String?>()
    val createDirectoryCalls = mutableListOf<CreateFilesystemDirectoryBody>()

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> = Result.failure(UnsupportedOperationException())

    override suspend fun getRuntimeSettings(serverOrigin: String): Result<RuntimeSettingsView> =
        Result.failure(UnsupportedOperationException())

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String?,
    ): Result<FilesystemDirectoryCollection> {
        listCalls += root
        browserFailure?.let { return Result.failure(it) }
        return Result.success(
            root?.let {
                byRoot[it] ?: FilesystemDirectoryCollection(
                    path = it,
                    parent = parentOf(it),
                    items = emptyList(),
                )
            } ?: home,
        )
    }

    override suspend fun createFilesystemDirectory(
        serverOrigin: String,
        body: CreateFilesystemDirectoryBody,
    ): Result<FilesystemDirectoryCreated> {
        events += "mkdir"
        createDirectoryCalls += body
        return createDirectoryResult(body)
    }

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = Result.failure(UnsupportedOperationException())

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<SessionCollection> = Result.failure(UnsupportedOperationException())

    override suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection> =
        Result.failure(UnsupportedOperationException())

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = Result.failure(UnsupportedOperationException())

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = Result.failure(UnsupportedOperationException())

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuth> = Result.failure(UnsupportedOperationException())

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSession> = Result.failure(UnsupportedOperationException())

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: AuthSessionAction,
    ): Result<AgentAuthSession> = Result.failure(UnsupportedOperationException())

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary> = Result.failure(UnsupportedOperationException())

    override suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ): Result<Unit> = Result.success(Unit)
}

private class FakeAddWorkspaceRepository(
    private val events: MutableList<String> = mutableListOf(),
    private val failure: Throwable? = null,
) : WorkspaceRepository {
    val createCalls = mutableListOf<CreateWorkspaceBody>()
    private val cached = MutableStateFlow<List<CachedWorkspace>>(emptyList())

    override fun observe(): Flow<List<CachedWorkspace>> = cached

    override fun observe(serverOrigin: String): Flow<List<CachedWorkspace>> = cached

    override suspend fun refresh(serverOrigin: String): Result<Unit> = Result.success(Unit)

    override suspend fun create(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> {
        events += "create"
        createCalls += body
        failure?.let { return Result.failure(it) }

        val workspace = Workspace(
            id = "ws_new",
            name = body.name ?: workspaceNameForPath(body.path),
            path = body.path,
            state = WorkspaceState.Available,
            createdAt = "2026-08-10T00:00:00.000Z",
            lastUsedAt = "2026-08-10T00:00:00.000Z",
        )
        cached.value = listOf(CachedWorkspace(serverOrigin, workspace))
        return Result.success(workspace)
    }
}
