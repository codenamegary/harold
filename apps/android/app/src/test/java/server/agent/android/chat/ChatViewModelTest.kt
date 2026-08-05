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
import server.agent.android.connection.ConnectionGateway
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AgentSettings
import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.ItemCollection
import server.agent.android.contracts.PageInfo
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection
import server.agent.android.contracts.WorkspaceState
import server.agent.android.events.ConnectionState
import server.agent.android.navigation.NavigationPreferences
import server.agent.android.operator.OperatorRepository
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway
import androidx.lifecycle.SavedStateHandle

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {
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
    fun loadsSessionsAndRestoresLastSession() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02")
        val viewModel = ChatViewModel(
            savedStateHandle = SavedStateHandle(),
            sessionGateway = ChatFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            connectionGateway = ChatFakeConnectionGateway(),
            operatorRepository = repository,
            navigationPreferences = navigation,
        )

        advanceUntilIdle()

        assertEquals("Selected", viewModel.uiState.value.selectedSession?.name)
        assertEquals(2, viewModel.uiState.value.sessions.size)
        assertEquals(listOf("sess_02"), repository.selectCalls)
    }

    @Test
    fun createSessionValidatesPrompt() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val viewModel = ChatViewModel(
            savedStateHandle = SavedStateHandle(),
            sessionGateway = ChatFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            connectionGateway = ChatFakeConnectionGateway(),
            operatorRepository = repository,
            navigationPreferences = ChatFakeNavigationPreferences(),
        )

        advanceUntilIdle()
        viewModel.showCreateDialog()
        advanceUntilIdle()
        viewModel.submitCreateSession()
        advanceUntilIdle()

        assertEquals("Enter an initial prompt", viewModel.uiState.value.createState.error)
        assertTrue(repository.createCalls.isEmpty())
    }

    @Test
    fun createSessionSubmitsWhenValid() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val viewModel = ChatViewModel(
            savedStateHandle = SavedStateHandle(),
            sessionGateway = ChatFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            connectionGateway = ChatFakeConnectionGateway(),
            operatorRepository = repository,
            navigationPreferences = ChatFakeNavigationPreferences(),
        )

        advanceUntilIdle()
        viewModel.showCreateDialog()
        advanceUntilIdle()
        viewModel.onCreateWorkspaceChanged("ws_01")
        viewModel.onCreateAgentChanged(AgentId.Cursor)
        viewModel.onCreatePromptChanged("Ship it")
        viewModel.submitCreateSession()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.createDialogVisible)
        assertEquals(1, repository.createCalls.size)
        assertTrue(repository.selectCalls.contains("sess_new"))
    }

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private class ChatFakeSessionGateway(
    initial: PairedState,
) : SessionGateway {
    private val _pairedState = MutableStateFlow(initial)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    override suspend fun refresh() = Unit
}

private class ChatFakeConnectionGateway : ConnectionGateway {
    private val _state = MutableStateFlow(ConnectionState())
    override val state: StateFlow<ConnectionState> = _state.asStateFlow()

    override fun connect(serverOrigin: String) = Unit
    override fun retry() = Unit
    override fun disconnect() = Unit
}

private class ChatFakeNavigationPreferences(
    private val lastSessionId: String? = null,
) : NavigationPreferences {
    var savedSessionId: String? = null
        private set

    override suspend fun loadLastSessionId(): String? = lastSessionId

    override suspend fun saveLastSessionId(sessionId: String) {
        savedSessionId = sessionId
    }

    override suspend fun clearLastSessionId() = Unit
}

private class ChatFakeOperatorRepository : OperatorRepository {
    val selectCalls = mutableListOf<String>()
    val createCalls = mutableListOf<CreateSessionBody>()
    private val createdSessions = mutableListOf<Session>()

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> = Result.success(
        WorkspaceCollection(
            items = listOf(
                Workspace(
                    id = "ws_01",
                    name = "agent-server",
                    path = "/tmp/agent-server",
                    state = WorkspaceState.Available,
                    createdAt = "2026-08-05T00:00:00.000Z",
                    lastUsedAt = "2026-08-05T00:00:00.000Z",
                ),
            ),
            page = PageInfo(limit = 100, count = 1),
        ),
    )

    override suspend fun listSessions(
        serverOrigin: String,
        workspaceId: String?,
        limit: Int,
    ): Result<ItemCollection<Session>> = Result.success(
        ItemCollection(
            items = createdSessions + listOf(
                session("sess_02", "Alpha"),
                session("sess_01", "Beta"),
            ),
            page = PageInfo(limit = 100, count = 2 + createdSessions.size),
        ),
    )

    override suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection> =
        Result.success(
            AgentSettingsCollection(
                items = listOf(
                    AgentSettings(
                        id = AgentId.Cursor,
                        displayName = "Cursor",
                        available = true,
                        enabled = true,
                        path = "/usr/local/bin/agent",
                    ),
                ),
            ),
        )

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> {
        createCalls += body

        val created = CreateSessionResponse(
            id = "sess_new",
            workspaceId = body.workspaceId,
            agentId = body.agentId,
            name = body.text,
            state = SessionState.Running,
            createdAt = "2026-08-05T00:00:00.000Z",
            lastUsedAt = "2026-08-05T00:00:00.000Z",
            archivedAt = null,
            turnId = "turn_01",
        )
        createdSessions += session(created.id, created.name)

        return Result.success(created)
    }

    override suspend fun selectSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session> {
        selectCalls += sessionId

        return Result.success(session(sessionId, "Selected"))
    }

    private fun session(id: String, name: String): Session = Session(
        id = id,
        workspaceId = "ws_01",
        agentId = AgentId.Cursor,
        name = name,
        state = SessionState.Idle,
        createdAt = "2026-08-05T00:00:00.000Z",
        lastUsedAt = "2026-08-05T00:00:00.000Z",
        archivedAt = null,
    )
}
