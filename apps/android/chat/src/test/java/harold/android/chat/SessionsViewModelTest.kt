package harold.android.chat

import harold.android.chat.data.CachedSession
import harold.android.chat.data.SessionRepository
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AttachmentReference
import harold.android.contracts.ConfigOption
import harold.android.contracts.Session
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
import harold.android.testing.FakeCredentialStore
import harold.android.live.SessionOwner
import harold.android.live.SessionSnapshot
import harold.android.navigation.Chat
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.PairedState
import harold.android.stream.ConnectionState
import harold.android.testing.FakeSessionGateway
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionsViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun loadsSessionsIntoItsOwnList() = runTest {
        val viewModel = viewModel(
            sessions = listOf(
                session("sess_02", "Beta", "2026-08-02T00:00:00.000Z"),
                session("sess_01", "Alpha", "2026-08-03T00:00:00.000Z"),
            ),
        )

        assertFalse(viewModel.uiState.value.loading)
        assertEquals(listOf("Alpha", "Beta"), viewModel.uiState.value.sessions.map { it.name })
        assertEquals("harold", viewModel.uiState.value.sessions.first().workspaceLabel)
        assertEquals("Cursor", viewModel.uiState.value.sessions.first().agentLabel)
    }

    @Test
    fun searchKeepsMatchingNames() = runTest {
        val viewModel = viewModel(
            sessions = listOf(
                session("sess_01", "Alpha", "2026-08-03T00:00:00.000Z"),
                session("sess_02", "Beta", "2026-08-02T00:00:00.000Z"),
            ),
        )

        viewModel.onSearchChanged("bet")

        assertEquals(listOf("Beta"), viewModel.uiState.value.sessions.map { it.name })
    }

    @Test
    fun selectTellsChatAndLeavesTheList() = runTest {
        val commands = RecordingSessionCommands()
        val navigator = testNavigator()
        navigator.openSessions()
        val viewModel = viewModel(commands = commands, navigator = navigator)

        val row = viewModel.uiState.value.sessions.single()
        viewModel.select(row)

        val opened = commands.emitted.single() as SessionCommand.Open
        assertEquals("sess_01", opened.row.sessionId)
        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun deleteRemovesTheRowAndTellsChat() = runTest {
        val commands = RecordingSessionCommands()
        val repository = repository()
        val viewModel = viewModel(repository = repository, commands = commands)
        val row = viewModel.uiState.value.sessions.single()

        viewModel.delete(row)

        assertEquals(listOf("sess_01"), repository.deleted)
        assertTrue(viewModel.uiState.value.sessions.isEmpty())
        val deleted = commands.emitted.single() as SessionCommand.Deleted
        assertEquals(row.id, deleted.row.id)
    }

    @Test
    fun deleteFailureKeepsTheRowAndShowsTheServerReason() = runTest {
        val commands = RecordingSessionCommands()
        val repository = RouteUserRepository(
            workspaces = listOf(workspace()),
            sessions = listOf(session("sess_01", "Alpha", "2026-08-03T00:00:00.000Z")),
            agents = listOf(agent()),
            deleteResult = Result.failure(
                AgentApiException(
                    AgentApiError.Problem(status = 409, title = "Conflict", detail = "Agent is disabled"),
                ),
            ),
        )
        val viewModel = viewModel(repository = repository, commands = commands)
        val row = viewModel.uiState.value.sessions.single()

        viewModel.delete(row)

        assertEquals("Agent is disabled", viewModel.uiState.value.error)
        assertEquals(listOf("sess_01"), viewModel.uiState.value.sessions.map { it.sessionId })
        assertTrue(commands.emitted.isEmpty())
    }

    @Test
    fun pushedTitlesRenameRowsInTheList() = runTest {
        val sessionOwner = SessionsFakeSessionOwner()
        val viewModel = viewModel(sessionOwner = sessionOwner)

        sessionOwner.publishTitles(mapOf("cursor:sess_01" to "Renamed by the agent"))

        assertEquals("Renamed by the agent", viewModel.uiState.value.sessions.single().name)
    }

    @Test
    fun pushedTitlesForOtherSessionsLeaveRowsAlone() = runTest {
        val sessionOwner = SessionsFakeSessionOwner()
        val viewModel = viewModel(sessionOwner = sessionOwner)

        sessionOwner.publishTitles(mapOf("cursor:sess_99" to "Elsewhere"))

        assertEquals("Alpha", viewModel.uiState.value.sessions.single().name)
    }

    @Test
    fun loadsSessionsFromEverySavedHaroldNewestFirst() = runTest {
        val repository = OriginSessionRepository(
            sessionsByOrigin = mapOf(
                LAPTOP to listOf(session("sess_laptop", "Alpha", "2026-08-02T00:00:00.000Z")),
                DESKTOP to listOf(session("sess_desktop", "Beta", "2026-08-04T00:00:00.000Z")),
            ),
        )
        val viewModel = viewModel(
            repository = repository,
            savedHarolds = saved(laptop("laptop", "tide", "bolt"), desktop("desktop", "ink", "mark")),
        )

        assertEquals(listOf("Beta", "Alpha"), viewModel.uiState.value.sessions.map { row -> row.name })
        assertEquals(listOf("desktop", "laptop"), viewModel.uiState.value.sessions.map { row -> row.haroldName })
        assertEquals("ink", viewModel.uiState.value.sessions.first().haroldColorId)
        assertEquals("mark", viewModel.uiState.value.sessions.first().haroldIconId)
        assertNotEquals(
            viewModel.uiState.value.sessions[0].id,
            viewModel.uiState.value.sessions[1].id,
        )
    }

    @Test
    fun choosingOneHaroldOnlyHidesTheOtherRows() = runTest {
        val viewModel = viewModel(
            repository = OriginSessionRepository(
                sessionsByOrigin = mapOf(
                    LAPTOP to listOf(session("sess_laptop", "Alpha", "2026-08-03T00:00:00.000Z")),
                    DESKTOP to listOf(session("sess_desktop", "Beta", "2026-08-02T00:00:00.000Z")),
                ),
            ),
            savedHarolds = saved(laptop("laptop", "tide", "bolt"), desktop("desktop", "ink", "mark")),
        )

        viewModel.onHaroldFilter(LAPTOP)

        assertEquals(listOf("Alpha"), viewModel.uiState.value.sessions.map { row -> row.name })

        viewModel.onHaroldFilter(null)

        assertEquals(listOf("Alpha", "Beta"), viewModel.uiState.value.sessions.map { row -> row.name })
    }

    @Test
    fun unreachableHaroldKeepsItsRowsWhileTheOtherHaroldUpdates() = runTest {
        val repository = OriginSessionRepository(
            sessionsByOrigin = mapOf(
                LAPTOP to listOf(session("sess_laptop", "Alpha", "2026-08-03T00:00:00.000Z")),
                DESKTOP to listOf(session("sess_desktop", "Beta", "2026-08-02T00:00:00.000Z")),
            ),
        )
        val viewModel = viewModel(
            repository = repository,
            savedHarolds = saved(laptop("laptop", "tide", "bolt"), desktop("desktop", "ink", "mark")),
        )
        repository.failOrigins += LAPTOP
        repository.sessionsByOrigin[DESKTOP] = listOf(
            session("sess_desktop", "Beta", "2026-08-02T00:00:00.000Z"),
            session("sess_new", "Gamma", "2026-08-05T00:00:00.000Z"),
        )

        viewModel.reload()

        val sessions = viewModel.uiState.value.sessions
        assertEquals(listOf("Gamma", "Alpha", "Beta"), sessions.map { row -> row.name })
        assertEquals(false, sessions.single { row -> row.name == "Alpha" }.haroldReachable)
        assertEquals(true, sessions.single { row -> row.name == "Gamma" }.haroldReachable)
    }

    private fun viewModel(
        sessions: List<Session> = listOf(session("sess_01", "Alpha", "2026-08-03T00:00:00.000Z")),
        commands: RecordingSessionCommands = RecordingSessionCommands(),
        navigator: harold.android.navigation.Navigator = testNavigator(),
        repository: harold.android.user.UserRepository = repository(sessions),
        sessionRepository: SessionRepository = TestSessionRepository(repository),
        sessionOwner: SessionsFakeSessionOwner = SessionsFakeSessionOwner(),
        savedHarolds: SavedHaroldRepository = SavedHaroldRepository(FakeCredentialStore()),
    ): SessionsViewModel = SessionsViewModel(
        sessionGateway = FakeSessionGateway(PAIRED),
        sessionRepository = sessionRepository,
        userRepository = repository,
        sessionCommands = commands,
        navigator = navigator,
        sessionOwner = sessionOwner,
        savedHaroldRepository = savedHarolds,
    )

    @Test
    fun showsCachedSessionsWhenTheHaroldIsOffline() = runTest {
        val origin = PAIRED.serverOrigin
        val network = OriginSessionRepository(
            sessionsByOrigin = mapOf(origin to listOf(session("sess_cached", "Cached", "2026-08-03T00:00:00.000Z"))),
        )
        val sessionRepository = TestSessionRepository(network)
        sessionRepository.seed(
            listOf(
                CachedSession(
                    serverOrigin = origin,
                    session = session("sess_cached", "Cached", "2026-08-03T00:00:00.000Z"),
                    workspaceId = "ws_01",
                    workspaceName = "harold",
                    agentLabel = "Cursor",
                ),
            ),
        )
        network.failOrigins += origin

        val viewModel = viewModel(repository = network, sessionRepository = sessionRepository)

        assertEquals(listOf("Cached"), viewModel.uiState.value.sessions.map { row -> row.name })
        assertFalse(viewModel.uiState.value.sessions.single().haroldReachable)
        assertNull(viewModel.uiState.value.error)
    }

    private fun repository(
        sessions: List<Session> = listOf(session("sess_01", "Alpha", "2026-08-03T00:00:00.000Z")),
    ): RouteUserRepository = RouteUserRepository(
        workspaces = listOf(workspace()),
        sessions = sessions,
        agents = listOf(agent()),
    )

    private fun session(id: String, title: String, updatedAt: String) = Session(
        agentId = "cursor",
        sessionId = id,
        cwd = "/tmp/harold",
        title = title,
        updatedAt = updatedAt,
    )

    private fun workspace() = Workspace(
        id = "ws_01",
        name = "harold",
        path = "/tmp/harold",
        state = WorkspaceState.Available,
        createdAt = "2026-08-01T00:00:00.000Z",
        lastUsedAt = "2026-08-01T00:00:00.000Z",
    )

    private fun agent() = AgentSettings(
        id = "cursor",
        displayName = "Cursor",
        available = true,
        enabled = true,
        path = null,
    )

    private companion object {
        val PAIRED = PairedState.Paired("http://127.0.0.1:8787", "device_01", "Pixel")
        const val LAPTOP = "http://laptop.local:3847"
        const val DESKTOP = "http://desktop.local:3847"
    }
}

private const val LAPTOP = "http://laptop.local:3847"
private const val DESKTOP = "http://desktop.local:3847"

private fun laptop(name: String, colorId: String, iconId: String) =
    storedHarold(LAPTOP, name, colorId, iconId, "device_laptop")

private fun desktop(name: String, colorId: String, iconId: String) =
    storedHarold(DESKTOP, name, colorId, iconId, "device_desktop")

private fun storedHarold(
    serverOrigin: String,
    name: String,
    colorId: String,
    iconId: String,
    deviceId: String,
) = StoredCredential(
    formatVersion = 1,
    deviceId = deviceId,
    serverOrigin = serverOrigin,
    deviceName = "Pixel",
    credential = "devcred_$deviceId",
    name = name,
    colorId = colorId,
    iconId = iconId,
)

private suspend fun saved(vararg harolds: StoredCredential): SavedHaroldRepository {
    val store = FakeCredentialStore()
    harolds.forEach { harold -> store.save(harold) }
    return SavedHaroldRepository(store)
}

private class OriginSessionRepository(
    sessionsByOrigin: Map<String, List<harold.android.contracts.Session>>,
) : harold.android.user.UserRepository {
    val sessionsByOrigin = sessionsByOrigin.toMutableMap()
    val failOrigins = mutableSetOf<String>()

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<harold.android.contracts.SessionCollection> {
        if (serverOrigin in failOrigins) {
            return Result.failure(IllegalStateException("offline"))
        }
        return Result.success(
            harold.android.contracts.SessionCollection(sessionsByOrigin[serverOrigin].orEmpty()),
        )
    }

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<harold.android.contracts.WorkspaceCollection> = Result.success(
        harold.android.contracts.ItemCollection(
            items = emptyList(),
            page = harold.android.contracts.PageInfo(limit = limit, count = 0),
        ),
    )

    override suspend fun listAgents(
        serverOrigin: String,
    ): Result<harold.android.contracts.AgentSettingsCollection> = Result.success(
        harold.android.contracts.AgentSettingsCollection(emptyList()),
    )

    override suspend fun getRuntimeSettings(serverOrigin: String) = error("unused")
    override suspend fun listFilesystemDirectories(serverOrigin: String, root: String) = error("unused")
    override suspend fun createWorkspace(
        serverOrigin: String,
        body: harold.android.contracts.CreateWorkspaceBody,
    ) = error("unused")
    override suspend fun createSession(
        serverOrigin: String,
        body: harold.android.contracts.CreateSessionBody,
    ) = error("unused")
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

private class SessionsFakeSessionOwner : SessionOwner {
    private val _sessionTitles = MutableStateFlow<Map<String, String>>(emptyMap())
    override val sessionTitles: StateFlow<Map<String, String>> = _sessionTitles.asStateFlow()

    override val connectionState: StateFlow<ConnectionState> =
        MutableStateFlow(ConnectionState()).asStateFlow()

    override val snapshot: StateFlow<SessionSnapshot> =
        MutableStateFlow(SessionSnapshot()).asStateFlow()

    override val promptCompletions: Flow<Unit> = MutableSharedFlow<Unit>().asSharedFlow()

    fun publishTitles(titles: Map<String, String>) {
        _sessionTitles.value = titles
    }

    override fun connect(serverOrigin: String) = Unit

    override fun retry() = Unit

    override fun disconnect() = Unit

    override fun onBackground() = Unit

    override fun onForeground() = Unit

    override fun watch(agentId: AgentId?, sessionId: String?) = Unit

    override suspend fun prompt(
        text: String,
        attachments: List<AttachmentReference>,
    ): Result<Unit> = Result.success(Unit)

    override suspend fun cancel(): Result<Unit> = Result.success(Unit)

    override suspend fun replyPermission(requestId: String, optionId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun replyExtension(requestId: String, result: JsonElement): Result<Unit> =
        Result.success(Unit)

    override fun rememberConfig(
        agentId: AgentId,
        sessionId: String,
        configOptions: List<ConfigOption>,
    ) = Unit

    override fun forget(agentId: AgentId, sessionId: String) = Unit
}
