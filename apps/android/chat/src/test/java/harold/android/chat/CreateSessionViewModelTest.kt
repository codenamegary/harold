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
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.database.session.CachedAgent
import harold.android.database.session.AgentRepository
import harold.android.database.workspace.WorkspaceRepository
import harold.android.navigation.AddWorkspace
import harold.android.navigation.Chat
import harold.android.navigation.CreateSession
import harold.android.navigation.CreatedWorkspaceResult
import harold.android.navigation.LastSessionSelection
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.ActiveConnectionState
import harold.android.testing.FakeConnectionStore
import harold.android.testing.FakeConnectionGateway
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
    fun listsWorkspacesFromEverySavedConnection() = runTest {
        val repository = FakeCreateRepository(
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
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt"), savedConnection(DESKTOP, "desktop", "ink", "mark")),
        )

        val rows = viewModel.uiState.value.workspaces
        assertEquals(listOf("notes", "notes"), rows.map { row -> row.name })
        assertEquals(listOf("laptop", "desktop"), rows.map { row -> row.connectionName })
        assertEquals(listOf("tide", "ink"), rows.map { row -> row.connectionColorId })
        assertEquals(listOf("bolt", "mark"), rows.map { row -> row.connectionIconId })
        assertTrue(rows[0].id != rows[1].id)
        assertEquals(listOf("cursor"), viewModel.uiState.value.agents.map { agent -> agent.id })
    }

    @Test
    fun keepsCachedWorkspacesWhenTheHaroldIsOffline() = runTest {
        val network = FakeCreateRepository(
            workspaces = emptyMap(),
            agents = mapOf(LAPTOP to listOf(agent("cursor", enabled = true))),
            failWorkspaces = setOf(LAPTOP),
        )
        val workspaceRepository = TestWorkspaceRepository(network).apply {
            seed(
                LAPTOP,
                listOf(workspace("ws_cached", WorkspaceState.Available, name = "notes")),
            )
        }
        val viewModel = viewModel(
            repository = network,
            workspaceRepository = workspaceRepository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
        )

        assertEquals(listOf("$LAPTOP|ws_cached"), viewModel.uiState.value.workspaces.map { row -> row.id })
        assertEquals(listOf("laptop"), viewModel.uiState.value.workspaces.map { row -> row.connectionName })
        assertNull(viewModel.uiState.value.error)
    }

    @Test
    fun pickingAWorkspaceLimitsAgentsToThatHarold() = runTest {
        val repository = FakeCreateRepository(
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
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt"), savedConnection(DESKTOP, "desktop", "ink", "mark")),
        )
        val desktop = viewModel.uiState.value.workspaces.single { row -> row.connectionName == "desktop" }

        viewModel.onWorkspaceChanged(desktop.id)

        assertEquals(listOf("codex"), viewModel.uiState.value.agents.map { agent -> agent.id })
        viewModel.submit()
        assertEquals(listOf(DESKTOP), repository.createdOrigins)
        assertTrue(commands.emitted.single() is SessionCommand.Created)
    }

    @Test
    fun pickingAWorkspaceOnTheSameConnectionKeepsTheSelectedAgent() = runTest {
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(
                    workspace("ws_laptop", WorkspaceState.Available, name = "notes"),
                    workspace("ws_other", WorkspaceState.Available, name = "other"),
                ),
            ),
            agents = mapOf(
                LAPTOP to listOf(
                    agent("claude", enabled = true),
                    agent("opencode", enabled = true),
                ),
            ),
        )
        val viewModel = viewModel(
            repository = repository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
        )

        assertEquals(listOf("claude", "opencode"), viewModel.uiState.value.agents.map { it.id })
        assertEquals("claude", viewModel.uiState.value.selectedAgentId)

        val other = viewModel.uiState.value.workspaces.single { row -> row.id == "$LAPTOP|ws_other" }
        viewModel.onWorkspaceChanged(other.id)

        assertEquals(listOf("claude", "opencode"), viewModel.uiState.value.agents.map { it.id })
        assertEquals("claude", viewModel.uiState.value.selectedAgentId)
    }

    @Test
    fun agentLoadFailureShowsAnErrorAndDoesNotStartASession() = runTest {
        val repository = FakeCreateRepository(
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
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
        )

        assertEquals("agents offline", viewModel.uiState.value.error)
        assertTrue(viewModel.uiState.value.agents.isEmpty())
        viewModel.submit()
        assertTrue(repository.createdOrigins.isEmpty())
        assertTrue(commands.emitted.isEmpty())
    }

    @Test
    fun keepsCachedAgentsWhenTheHaroldIsOffline() = runTest {
        val network = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes")),
            ),
            agents = emptyMap(),
            failAgents = setOf(LAPTOP),
        )
        val agentRepository = TestAgentRepository(network).apply {
            seedAgents(
                LAPTOP,
                listOf(
                    CachedAgent(
                        connectionId = LAPTOP,
                        agentId = "cursor",
                        displayName = "Cursor",
                        enabled = true,
                    ),
                ),
            )
        }

        val viewModel = viewModel(
            repository = network,
            agentRepository = agentRepository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
        )

        assertEquals(listOf("cursor"), viewModel.uiState.value.agents.map { agent -> agent.id })
        assertNull(viewModel.uiState.value.error)
    }

    @Test
    fun submitWithoutAWorkspaceReportsAnError() = runTest {
        val network = RouteUserRepository()
        val viewModel = viewModel(
            repository = network,
            workspaceRepository = TestWorkspaceRepository(network),
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
        val savedConnections = saved(
            savedConnection(LAPTOP, "laptop", "tide", "bolt"),
            savedConnection(DESKTOP, "desktop", "ink", "mark"),
        )
        val laptopWorkspaces = mutableListOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes"))
        val desktopWorkspaces = mutableListOf(workspace("ws_desktop", WorkspaceState.Available, name = "docs"))
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to laptopWorkspaces,
                DESKTOP to desktopWorkspaces,
            ),
            agents = mapOf(
                LAPTOP to listOf(agent("cursor", enabled = true)),
                DESKTOP to listOf(agent("claude", enabled = true)),
            ),
        )
        val workspaceRepository = TestWorkspaceRepository(repository)
        val viewModel = viewModel(
            navigator = navigator,
            repository = repository,
            workspaceRepository = workspaceRepository,
            savedConnections = savedConnections,
        )

        assertEquals("$LAPTOP|ws_laptop", viewModel.uiState.value.selectedWorkspaceId)

        viewModel.openNewWorkspace()
        assertEquals(listOf(Chat, CreateSession, AddWorkspace), navigator.backStack.toList())

        // Cancel from AddWorkspace: selection stays unchanged
        navigator.goBack()
        assertEquals("$LAPTOP|ws_laptop", viewModel.uiState.value.selectedWorkspaceId)

        // Open again and save a new workspace on DESKTOP
        viewModel.openNewWorkspace()
        val fresh = workspace("ws_new", WorkspaceState.Available, name = "fresh")
        desktopWorkspaces += fresh
        workspaceRepository.seed(DESKTOP, listOf(fresh))
        navigator.reportWorkspaceCreated(
            CreatedWorkspaceResult(
                workspaceId = "ws_new",
                connectionId = DESKTOP,
            ),
        )
        navigator.goBack()

        assertEquals("$DESKTOP|ws_new", viewModel.uiState.value.selectedWorkspaceId)
        assertEquals("claude", viewModel.uiState.value.selectedAgentId)
    }

    @Test
    fun preselectsTheRememberedWorkspaceAndAgent() = runTest {
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(
                    workspace("ws_notes", WorkspaceState.Available, name = "notes"),
                    workspace("ws_server", WorkspaceState.Available, name = "server"),
                ),
            ),
            agents = mapOf(
                LAPTOP to listOf(
                    agent("cursor", enabled = true),
                    agent("codex", enabled = true),
                ),
            ),
        )
        val preferences = FakeSessionPreferences(
            selection = LastSessionSelection(
                connectionId = LAPTOP,
                workspaceId = "ws_server",
                agentId = "codex",
            ),
        )

        val viewModel = viewModel(
            repository = repository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
            sessionPreferences = preferences,
        )

        assertEquals("$LAPTOP|ws_server", viewModel.uiState.value.selectedWorkspaceId)
        assertEquals("codex", viewModel.uiState.value.selectedAgentId)
    }

    @Test
    fun preselectsTheWorkspaceOpenedFromTheWorkspaceList() = runTest {
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(
                    workspace("ws_notes", WorkspaceState.Available, name = "notes"),
                    workspace("ws_server", WorkspaceState.Available, name = "server"),
                ),
            ),
            agents = mapOf(
                LAPTOP to listOf(
                    agent("cursor", enabled = true),
                    agent("codex", enabled = true),
                ),
            ),
        )
        val navigator = testNavigator()
        navigator.openCreateSessionForWorkspace(LAPTOP, "/tmp/ws_server")

        val viewModel = viewModel(
            navigator = navigator,
            repository = repository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
        )

        assertEquals("$LAPTOP|ws_server", viewModel.uiState.value.selectedWorkspaceId)
    }

    @Test
    fun missingRememberedWorkspaceFallsBackToTheFirstWorkspaceAndAgent() = runTest {
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(workspace("ws_notes", WorkspaceState.Available, name = "notes")),
            ),
            agents = mapOf(
                LAPTOP to listOf(
                    agent("cursor", enabled = true),
                    agent("codex", enabled = true),
                ),
            ),
        )
        val preferences = FakeSessionPreferences(
            selection = LastSessionSelection(
                connectionId = LAPTOP,
                workspaceId = "ws_gone",
                agentId = "codex",
            ),
        )

        val viewModel = viewModel(
            repository = repository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
            sessionPreferences = preferences,
        )

        assertEquals("$LAPTOP|ws_notes", viewModel.uiState.value.selectedWorkspaceId)
        assertEquals("cursor", viewModel.uiState.value.selectedAgentId)
    }

    @Test
    fun disabledRememberedAgentKeepsTheWorkspaceAndUsesTheFirstEnabledAgent() = runTest {
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(workspace("ws_notes", WorkspaceState.Available, name = "notes")),
            ),
            agents = mapOf(
                LAPTOP to listOf(
                    agent("cursor", enabled = true),
                    agent("codex", enabled = false),
                ),
            ),
        )
        val preferences = FakeSessionPreferences(
            selection = LastSessionSelection(
                connectionId = LAPTOP,
                workspaceId = "ws_notes",
                agentId = "codex",
            ),
        )

        val viewModel = viewModel(
            repository = repository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
            sessionPreferences = preferences,
        )

        assertEquals("$LAPTOP|ws_notes", viewModel.uiState.value.selectedWorkspaceId)
        assertEquals("cursor", viewModel.uiState.value.selectedAgentId)
    }

    @Test
    fun rememberedWorkspaceWithoutAnActiveConnectionFallsBack() = runTest {
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes")),
            ),
            agents = mapOf(
                LAPTOP to listOf(agent("cursor", enabled = true)),
            ),
        )
        val preferences = FakeSessionPreferences(
            selection = LastSessionSelection(
                connectionId = DESKTOP,
                workspaceId = "ws_desktop",
                agentId = "codex",
            ),
        )

        val viewModel = viewModel(
            repository = repository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
            sessionPreferences = preferences,
        )

        assertEquals("$LAPTOP|ws_laptop", viewModel.uiState.value.selectedWorkspaceId)
        assertEquals("cursor", viewModel.uiState.value.selectedAgentId)
    }

    @Test
    fun explicitSelectionBeatsTheRememberedSelectionOnLaterEmissions() = runTest {
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to listOf(
                    workspace("ws_laptop", WorkspaceState.Available, name = "notes"),
                    workspace("ws_other", WorkspaceState.Available, name = "other"),
                ),
            ),
            agents = mapOf(
                LAPTOP to listOf(
                    agent("cursor", enabled = true),
                    agent("codex", enabled = true),
                ),
            ),
        )
        val workspaceRepository = TestWorkspaceRepository(repository)
        val preferences = FakeSessionPreferences(
            selection = LastSessionSelection(
                connectionId = LAPTOP,
                workspaceId = "ws_laptop",
                agentId = "cursor",
            ),
        )
        val viewModel = viewModel(
            repository = repository,
            workspaceRepository = workspaceRepository,
            savedConnections = saved(savedConnection(LAPTOP, "laptop", "tide", "bolt")),
            sessionPreferences = preferences,
        )
        val other = viewModel.uiState.value.workspaces.single { row -> row.id == "$LAPTOP|ws_other" }

        viewModel.onWorkspaceChanged(other.id)
        workspaceRepository.seed(
            LAPTOP,
            listOf(
                workspace("ws_laptop", WorkspaceState.Available, name = "notes"),
                workspace("ws_other", WorkspaceState.Available, name = "other"),
                workspace("ws_new", WorkspaceState.Available, name = "new"),
            ),
        )

        assertEquals("$LAPTOP|ws_other", viewModel.uiState.value.selectedWorkspaceId)
    }

    @Test
    fun aNewlyCreatedWorkspaceBeatsTheRememberedSelection() = runTest {
        val navigator = testNavigator()
        navigator.openCreateSession()
        val laptopWorkspaces = mutableListOf(workspace("ws_laptop", WorkspaceState.Available, name = "notes"))
        val desktopWorkspaces = mutableListOf(workspace("ws_desktop", WorkspaceState.Available, name = "docs"))
        val repository = FakeCreateRepository(
            workspaces = mapOf(
                LAPTOP to laptopWorkspaces,
                DESKTOP to desktopWorkspaces,
            ),
            agents = mapOf(
                LAPTOP to listOf(agent("cursor", enabled = true)),
                DESKTOP to listOf(agent("claude", enabled = true)),
            ),
        )
        val workspaceRepository = TestWorkspaceRepository(repository)
        val preferences = FakeSessionPreferences(
            selection = LastSessionSelection(
                connectionId = LAPTOP,
                workspaceId = "ws_laptop",
                agentId = "cursor",
            ),
        )
        val viewModel = viewModel(
            navigator = navigator,
            repository = repository,
            workspaceRepository = workspaceRepository,
            savedConnections = saved(
                savedConnection(LAPTOP, "laptop", "tide", "bolt"),
                savedConnection(DESKTOP, "desktop", "ink", "mark"),
            ),
            sessionPreferences = preferences,
        )
        assertEquals("$LAPTOP|ws_laptop", viewModel.uiState.value.selectedWorkspaceId)

        viewModel.openNewWorkspace()
        val fresh = workspace("ws_new", WorkspaceState.Available, name = "fresh")
        desktopWorkspaces += fresh
        workspaceRepository.seed(DESKTOP, listOf(fresh))
        navigator.reportWorkspaceCreated(
            CreatedWorkspaceResult(workspaceId = "ws_new", connectionId = DESKTOP),
        )

        assertEquals("$DESKTOP|ws_new", viewModel.uiState.value.selectedWorkspaceId)
        assertEquals("claude", viewModel.uiState.value.selectedAgentId)
    }

    private fun viewModel(
        commands: RecordingSessionCommands = RecordingSessionCommands(),
        navigator: harold.android.navigation.Navigator = testNavigator(),
        repository: harold.android.user.UserRepository = repository(),
        agentRepository: AgentRepository = TestAgentRepository(repository),
        workspaceRepository: WorkspaceRepository = TestWorkspaceRepository(repository),
        savedConnections: ConnectionRepository? = null,
        sessionPreferences: FakeSessionPreferences = FakeSessionPreferences(),
    ): CreateSessionViewModel = CreateSessionViewModel(
        connectionGateway = FakeConnectionGateway(ACTIVE),
        agentRepository = agentRepository,
        workspaceRepository = workspaceRepository,
        userRepository = repository,
        sessionCommands = commands,
        navigator = navigator,
        connectionRepository = savedConnections,
        sessionPreferences = sessionPreferences,
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
        val ACTIVE = ActiveConnectionState.Active("http://127.0.0.1:8787", "Pixel")
        const val LAPTOP = "http://laptop.local:3847"
        const val DESKTOP = "http://desktop.local:3847"
    }
}

private fun savedConnection(origin: String, name: String, colorId: String, iconId: String) = SavedConnection(
    formatVersion = 3,
    connectionId = origin,
    deviceName = "Pixel",
    name = name,
    colorId = colorId,
    iconId = iconId,
    ssh = harold.android.credentials.SshConfig(
        host = origin,
        port = 22,
        user = "gary",
        auth = harold.android.credentials.SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)

private suspend fun saved(vararg connections: SavedConnection): ConnectionRepository {
    val store = FakeConnectionStore()
    connections.forEach { connection -> store.save(connection) }
    return ConnectionRepository(store)
}

private class FakeCreateRepository(
    private val workspaces: Map<String, List<Workspace>>,
    private val agents: Map<String, List<AgentSettings>>,
    private val failAgents: Set<String> = emptySet(),
    private val failWorkspaces: Set<String> = emptySet(),
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

    override suspend fun listWorkspaces(connectionId: String, limit: Int): Result<ItemCollection<Workspace>> {
        if (connectionId in failWorkspaces) {
            return Result.failure(IllegalStateException("workspaces offline"))
        }
        return Result.success(
            ItemCollection(
                items = workspaces[connectionId].orEmpty(),
                page = PageInfo(limit = limit, count = workspaces[connectionId].orEmpty().size),
            ),
        )
    }

    override suspend fun listAgents(connectionId: String): Result<AgentSettingsCollection> {
        if (connectionId in failAgents) {
            return Result.failure(IllegalStateException("agents offline"))
        }
        return Result.success(AgentSettingsCollection(agents[connectionId].orEmpty()))
    }

    override suspend fun createSession(connectionId: String, body: CreateSessionBody): Result<CreateSessionResponse> {
        createdOrigins += connectionId
        return createResult
    }

    override suspend fun listFilesystemDirectories(connectionId: String, root: String?) = error("unused")
    override suspend fun createFilesystemDirectory(
        connectionId: String,
        body: harold.android.contracts.CreateFilesystemDirectoryBody,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCreated>(
        UnsupportedOperationException("unused"),
    )

    override suspend fun createWorkspace(
        connectionId: String,
        body: harold.android.contracts.CreateWorkspaceBody,
    ) = error("unused")
    override suspend fun listSessions(connectionId: String, cwd: String?) =
        Result.success(SessionCollection(emptyList()))
    override suspend fun deleteSession(connectionId: String, agentId: AgentId, sessionId: String) = error("unused")
    override suspend fun getAgentAuth(connectionId: String, agentId: AgentId) = error("unused")
    override suspend fun logoutAgentAuth(connectionId: String, agentId: AgentId) = error("unused")
}
