package harold.android.chat

import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.ItemCollection
import harold.android.contracts.PageInfo
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
import harold.android.session.HaroldConnection
import harold.android.session.HaroldConnectionStatus
import harold.android.session.HaroldConnections
import harold.android.testing.FakeCredentialStore
import harold.android.navigation.AddWorkspace
import harold.android.navigation.Chat
import harold.android.navigation.CreateSession
import harold.android.navigation.CreatedWorkspaceResult
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.PairedState
import harold.android.testing.FakeSessionGateway
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CreateSessionViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun loadsAvailableWorkspacesAndEnabledAgents() = runTest {
        val viewModel = viewModel()

        assertEquals(listOf("ws_01"), viewModel.uiState.value.workspaces.map { it.id })
        assertEquals("ws_01", viewModel.uiState.value.selectedWorkspaceId)
        assertEquals(listOf("cursor"), viewModel.uiState.value.agents.map { it.id })
        assertEquals("cursor", viewModel.uiState.value.selectedAgentId)
    }

    @Test
    fun listsWorkspacesFromEveryReachableHarold() = runTest {
        val repository = HaroldCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes")),
                DESKTOP to listOf(workspace("ws_desktop", WorkspaceState.Available, name = "notes")),
            ),
            agents = mapOf(
                LAPTOP to listOf(agent("cursor", enabled = true)),
                DESKTOP to listOf(agent("codex", enabled = true)),
            ),
        )
        val viewModel = viewModel(
            repository = repository,
            savedHarolds = saved(harold(LAPTOP, "laptop", "tide", "bolt"), harold(DESKTOP, "desktop", "ink", "mark")),
            connections = links(
                HaroldConnection(LAPTOP, HaroldConnectionStatus.Connected),
                HaroldConnection(DESKTOP, HaroldConnectionStatus.Connected),
            ),
        )

        val rows = viewModel.uiState.value.workspaces
        assertEquals(listOf("notes", "notes"), rows.map { row -> row.name })
        assertEquals(listOf("laptop", "desktop"), rows.map { row -> row.haroldName })
        assertEquals(listOf("tide", "ink"), rows.map { row -> row.haroldColorId })
        assertEquals(listOf("bolt", "mark"), rows.map { row -> row.haroldIconId })
        assertTrue(rows[0].id != rows[1].id)
        assertEquals(listOf("cursor"), viewModel.uiState.value.agents.map { agent -> agent.id })
    }

    @Test
    fun leavesUnreachableHaroldsOutOfTheWorkspaceList() = runTest {
        val viewModel = viewModel(
            repository = HaroldCreateRepository(
                workspaces = mapOf(
                    LAPTOP to listOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes")),
                    DESKTOP to listOf(workspace("ws_desktop", WorkspaceState.Available, name = "server")),
                ),
                agents = mapOf(
                    LAPTOP to listOf(agent("cursor", enabled = true)),
                    DESKTOP to listOf(agent("codex", enabled = true)),
                ),
            ),
            savedHarolds = saved(harold(LAPTOP, "laptop", "tide", "bolt"), harold(DESKTOP, "desktop", "ink", "mark")),
            connections = links(
                HaroldConnection(LAPTOP, HaroldConnectionStatus.Connected),
                HaroldConnection(DESKTOP, HaroldConnectionStatus.Unreachable),
            ),
        )

        assertEquals(listOf("laptop"), viewModel.uiState.value.workspaces.map { row -> row.haroldName })
    }

    @Test
    fun pickingAWorkspaceLimitsAgentsToThatHarold() = runTest {
        val repository = HaroldCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes")),
                DESKTOP to listOf(workspace("ws_desktop", WorkspaceState.Available, name = "server")),
            ),
            agents = mapOf(
                LAPTOP to listOf(agent("cursor", enabled = true)),
                DESKTOP to listOf(agent("codex", enabled = true)),
            ),
        )
        val commands = RecordingSessionCommands()
        val viewModel = viewModel(
            commands = commands,
            repository = repository,
            savedHarolds = saved(harold(LAPTOP, "laptop", "tide", "bolt"), harold(DESKTOP, "desktop", "ink", "mark")),
            connections = links(
                HaroldConnection(LAPTOP, HaroldConnectionStatus.Connected),
                HaroldConnection(DESKTOP, HaroldConnectionStatus.Connected),
            ),
        )
        val desktop = viewModel.uiState.value.workspaces.single { row -> row.haroldName == "desktop" }

        viewModel.onWorkspaceChanged(desktop.id)

        assertEquals(listOf("codex"), viewModel.uiState.value.agents.map { agent -> agent.id })
        viewModel.submit()
        assertEquals(listOf(DESKTOP), repository.createdOrigins)
        assertTrue(commands.emitted.single() is SessionCommand.Created)
    }

    @Test
    fun agentLoadFailureShowsAnErrorAndDoesNotStartASession() = runTest {
        val repository = HaroldCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes")),
            ),
            agents = emptyMap(),
            failAgents = setOf(LAPTOP),
        )
        val commands = RecordingSessionCommands()
        val viewModel = viewModel(
            commands = commands,
            repository = repository,
            savedHarolds = saved(harold(LAPTOP, "laptop", "tide", "bolt")),
            connections = links(HaroldConnection(LAPTOP, HaroldConnectionStatus.Connected)),
        )

        assertEquals("agents offline", viewModel.uiState.value.error)
        assertTrue(viewModel.uiState.value.agents.isEmpty())
        viewModel.submit()
        assertTrue(repository.createdOrigins.isEmpty())
        assertTrue(commands.emitted.isEmpty())
    }

    @Test
    fun submitWithoutAWorkspaceReportsAnError() = runTest {
        val viewModel = viewModel(
            repository = RouteUserRepository(),
        )

        viewModel.submit()

        assertEquals("Choose a workspace", viewModel.uiState.value.error)
    }

    @Test
    fun submitCreatesTheSessionAndReturnsToChat() = runTest {
        val commands = RecordingSessionCommands()
        val navigator = testNavigator()
        navigator.openCreateSession()
        val viewModel = viewModel(commands = commands, navigator = navigator)

        viewModel.submit()

        val created = commands.emitted.single() as SessionCommand.Created
        assertEquals("sess_new", created.response.sessionId)
        assertEquals(listOf(Chat), navigator.backStack.toList())
        assertTrue(viewModel.uiState.value.submitting)
    }

    @Test
    fun submitFailureStaysOnTheRouteWithTheServerReason() = runTest {
        val commands = RecordingSessionCommands()
        val navigator = testNavigator()
        navigator.openCreateSession()
        val viewModel = viewModel(
            commands = commands,
            navigator = navigator,
            repository = repository(
                createResult = Result.failure(
                    AgentApiException(
                        AgentApiError.Problem(status = 409, title = "ACP unavailable", detail = "Agent crashed"),
                    ),
                ),
            ),
        )

        viewModel.submit()

        assertEquals("Agent crashed", viewModel.uiState.value.error)
        assertFalse(viewModel.uiState.value.submitting)
        assertTrue(commands.emitted.isEmpty())
        assertEquals(listOf(Chat, CreateSession), navigator.backStack.toList())
    }

    @Test
    fun submitThatNeedsLoginReturnsAPendingSession() = runTest {
        val commands = RecordingSessionCommands()
        val navigator = testNavigator()
        navigator.openCreateSession()
        val viewModel = viewModel(
            commands = commands,
            navigator = navigator,
            repository = repository(
                createResult = Result.failure(IllegalStateException("needs login")),
                authStatus = AgentAuthStatus.NeedsAuth,
            ),
        )

        viewModel.submit()

        val pending = commands.emitted.single() as SessionCommand.Pending
        assertEquals("ws_01", pending.workspace.id)
        assertEquals("cursor", pending.agentId)
        assertNull(viewModel.uiState.value.error)
        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun newWorkspaceSelectsCreatedWorkspaceOnSaveAndKeepsSelectionOnCancel() = runTest {
        val navigator = testNavigator()
        navigator.openCreateSession()
        val savedHarolds = saved(
            harold(LAPTOP, "laptop", "tide", "bolt"),
            harold(DESKTOP, "desktop", "ink", "mark"),
        )
        val laptopWorkspaces = mutableListOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes"))
        val desktopWorkspaces = mutableListOf(workspace("ws_desktop", WorkspaceState.Available, name = "docs"))
        val repository = HaroldCreateRepository(
            workspaces = mapOf(
                LAPTOP to laptopWorkspaces,
                DESKTOP to desktopWorkspaces,
            ),
            agents = mapOf(
                LAPTOP to listOf(agent("cursor", enabled = true)),
                DESKTOP to listOf(agent("claude", enabled = true)),
            ),
        )
        val viewModel = viewModel(
            navigator = navigator,
            repository = repository,
            savedHarolds = savedHarolds,
        )

        assertEquals("$LAPTOP|ws_laptop", viewModel.uiState.value.selectedWorkspaceId)

        viewModel.openNewWorkspace()
        assertEquals(listOf(Chat, CreateSession, AddWorkspace), navigator.backStack.toList())

        // Cancel from AddWorkspace: selection stays unchanged
        navigator.goBack()
        assertEquals("$LAPTOP|ws_laptop", viewModel.uiState.value.selectedWorkspaceId)

        // Open again and save a new workspace on DESKTOP
        viewModel.openNewWorkspace()
        desktopWorkspaces += workspace("ws_new", WorkspaceState.Available, name = "fresh")
        navigator.reportWorkspaceCreated(
            CreatedWorkspaceResult(
                workspaceId = "ws_new",
                serverOrigin = DESKTOP,
            ),
        )
        navigator.goBack()

        assertEquals("$DESKTOP|ws_new", viewModel.uiState.value.selectedWorkspaceId)
        assertEquals("claude", viewModel.uiState.value.selectedAgentId)
    }

    private fun viewModel(
        commands: RecordingSessionCommands = RecordingSessionCommands(),
        navigator: harold.android.navigation.Navigator = testNavigator(),
        repository: harold.android.user.UserRepository = repository(),
        savedHarolds: SavedHaroldRepository? = null,
        connections: HaroldConnections? = null,
    ): CreateSessionViewModel = CreateSessionViewModel(
        sessionGateway = FakeSessionGateway(PAIRED),
        userRepository = repository,
        sessionCommands = commands,
        navigator = navigator,
        savedHaroldRepository = savedHarolds,
        haroldConnections = connections,
    )

    private fun repository(
        createResult: Result<CreateSessionResponse> = Result.success(
            CreateSessionResponse(
                agentId = "cursor",
                sessionId = "sess_new",
                cwd = "/tmp/harold",
                title = "New session",
                updatedAt = "2026-08-05T00:00:00.000Z",
                configOptions = emptyList(),
            ),
        ),
        authStatus: AgentAuthStatus = AgentAuthStatus.Authenticated,
    ): RouteUserRepository = RouteUserRepository(
        workspaces = listOf(
            workspace("ws_01", WorkspaceState.Available),
            workspace("ws_missing", WorkspaceState.Missing),
        ),
        agents = listOf(
            agent("cursor", enabled = true),
            agent("codex", enabled = false),
        ),
        createResult = createResult,
        authStatus = authStatus,
    )

    private fun workspace(id: String, state: WorkspaceState, name: String = id) = Workspace(
        id = id,
        name = name,
        path = "/tmp/$id",
        state = state,
        createdAt = "2026-08-01T00:00:00.000Z",
        lastUsedAt = "2026-08-01T00:00:00.000Z",
    )

    private fun agent(id: String, enabled: Boolean) = AgentSettings(
        id = id,
        displayName = id,
        available = true,
        enabled = enabled,
        path = null,
    )

    private companion object {
        val PAIRED = PairedState.Paired("http://127.0.0.1:8787", "device_01", "Pixel")
        const val LAPTOP = "http://laptop.local:3847"
        const val DESKTOP = "http://desktop.local:3847"
    }
}

private fun harold(origin: String, name: String, colorId: String, iconId: String) = StoredCredential(
    formatVersion = 1,
    deviceId = "device_$name",
    serverOrigin = origin,
    deviceName = "Pixel",
    credential = "devcred_$name",
    name = name,
    colorId = colorId,
    iconId = iconId,
)

private suspend fun saved(vararg harolds: StoredCredential): SavedHaroldRepository {
    val store = FakeCredentialStore()
    harolds.forEach { harold -> store.save(harold) }
    return SavedHaroldRepository(store)
}

private class HaroldCreateRepository(
    private val workspaces: Map<String, List<Workspace>>,
    private val agents: Map<String, List<AgentSettings>>,
    private val failAgents: Set<String> = emptySet(),
    private val createResult: Result<CreateSessionResponse> = Result.success(
        CreateSessionResponse(
            agentId = "cursor",
            sessionId = "sess_new",
            cwd = "/tmp/harold",
            title = "New session",
            updatedAt = "2026-08-05T00:00:00.000Z",
            configOptions = emptyList(),
        ),
    ),
) : harold.android.user.UserRepository {
    val createdOrigins = mutableListOf<String>()

    override suspend fun listWorkspaces(serverOrigin: String, limit: Int) = Result.success(
        ItemCollection(
            items = workspaces[serverOrigin].orEmpty(),
            page = PageInfo(limit = limit, count = workspaces[serverOrigin].orEmpty().size),
        ),
    )

    override suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection> {
        if (serverOrigin in failAgents) {
            return Result.failure(IllegalStateException("agents offline"))
        }
        return Result.success(AgentSettingsCollection(agents[serverOrigin].orEmpty()))
    }

    override suspend fun createSession(serverOrigin: String, body: CreateSessionBody): Result<CreateSessionResponse> {
        createdOrigins += serverOrigin
        return createResult
    }

    override suspend fun getRuntimeSettings(serverOrigin: String) = error("unused")
    override suspend fun listFilesystemDirectories(serverOrigin: String, root: String) = error("unused")
    override suspend fun createWorkspace(
        serverOrigin: String,
        body: harold.android.contracts.CreateWorkspaceBody,
    ) = error("unused")
    override suspend fun listSessions(serverOrigin: String, cwd: String?) =
        Result.success(SessionCollection(emptyList()))
    override suspend fun deleteSession(serverOrigin: String, agentId: AgentId, sessionId: String) = error("unused")
    override suspend fun getAgentAuth(serverOrigin: String, agentId: AgentId) = error("unused")
    override suspend fun startAgentAuthSession(serverOrigin: String, agentId: AgentId) = error("unused")
    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: harold.android.contracts.AuthSessionAction,
    ) = error("unused")
    override suspend fun logoutAgentAuth(serverOrigin: String, agentId: AgentId) = error("unused")
    override suspend fun revokeDevice(serverOrigin: String, deviceId: String) = error("unused")
}

private fun links(vararg connections: HaroldConnection): HaroldConnections =
    object : HaroldConnections {
        override val connections = kotlinx.coroutines.flow.MutableStateFlow(connections.toList())
        override fun onForeground() = Unit
        override fun onBackground() = Unit
        override suspend fun refresh() = Unit
        override fun setSessionStates(serverOrigin: String, states: List<harold.android.contracts.SessionState>) = Unit
        override fun shouldStayConnected(serverOrigin: String): Boolean = true
    }
