package server.agent.android.chat

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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
import server.agent.android.contracts.PageInfo
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionCollection
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection
import server.agent.android.contracts.WorkspaceState
import server.agent.android.events.ConnectionState
import server.agent.android.navigation.NavigationPreferences
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.operator.OperatorRepository
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway

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
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            connection = connection,
        )

        advanceUntilIdle()

        assertEquals("Alpha", viewModel.uiState.value.selectedSession?.name)
        assertEquals(2, viewModel.uiState.value.sessions.size)
        assertEquals("cursor" to "sess_02", connection.target)
    }

    @Test
    fun createSessionValidatesPrompt() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val viewModel = createViewModel(repository, ChatFakeNavigationPreferences())

        advanceUntilIdle()
        viewModel.showCreateDialog()
        advanceUntilIdle()
        viewModel.submitCreateSession()
        advanceUntilIdle()

        assertEquals("Enter an initial prompt", viewModel.uiState.value.createState.error)
        assertTrue(repository.createCalls.isEmpty())
    }

    @Test
    fun createSessionSubmitsWhenValidThenPromptsAfterSubscribe() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            connection = connection,
        )

        advanceUntilIdle()
        viewModel.showCreateDialog()
        advanceUntilIdle()
        viewModel.onCreateWorkspaceChanged("ws_01")
        viewModel.onCreateAgentChanged("cursor")
        viewModel.onCreatePromptChanged("Ship it")
        viewModel.submitCreateSession()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.createDialogVisible)
        assertEquals(1, repository.createCalls.size)
        assertEquals("/tmp/agent-server", repository.createCalls.first().cwd)
        assertEquals("sess_new", viewModel.uiState.value.selectedSession?.sessionId)

        connection.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_new"),
        )
        advanceUntilIdle()

        val prompt = connection.sent.filterIsInstance<SessionStreamClientMessage.Prompt>().single()
        assertEquals("Ship it", prompt.text)
        assertTrue(viewModel.uiState.value.transcript.rows.first() is TranscriptUserRow)
    }

    @Test
    fun streamsTranscriptAndAllowsFollowUpPrompt() = runTest(dispatcher) {
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            connection = connection,
        )

        advanceUntilIdle()
        connection.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_02"),
        )
        advanceUntilIdle()

        viewModel.onComposerTextChanged("Follow up")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()

        val prompt = connection.sent.filterIsInstance<SessionStreamClientMessage.Prompt>().single()
        assertEquals("Follow up", prompt.text)
        assertEquals("", viewModel.uiState.value.composerText)
        assertEquals(SessionState.Running, viewModel.uiState.value.effectiveSessionState)
    }

    @Test
    fun cancelSessionSendsStreamCancel() = runTest(dispatcher) {
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            connection = connection,
        )

        advanceUntilIdle()
        connection.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_02"),
        )
        viewModel.onComposerTextChanged("Go")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()
        viewModel.submitCancel()
        advanceUntilIdle()

        assertTrue(connection.sent.any { message -> message is SessionStreamClientMessage.Cancel })
    }

    @Test
    fun deleteSessionRemovesRowAndClearsSelection() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02")
        val viewModel = createViewModel(repository, navigation)

        advanceUntilIdle()
        val selected = viewModel.uiState.value.selectedSession!!
        viewModel.deleteSession(selected)
        advanceUntilIdle()

        assertEquals(null, viewModel.uiState.value.selectedSession)
        assertTrue(viewModel.uiState.value.sessions.none { row -> row.sessionId == "sess_02" })
        assertEquals("sess_02", repository.deleteCalls.single().second)
        assertEquals(null, navigation.savedSessionId)
    }

    @Test
    fun deleteSessionShowsErrorOnConflict() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(deleteConflict = true)
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
        )

        advanceUntilIdle()
        viewModel.deleteSession(viewModel.uiState.value.selectedSession!!)
        advanceUntilIdle()

        assertEquals(
            "Agent is disabled",
            viewModel.uiState.value.sessionsError,
        )
        assertEquals("sess_02", viewModel.uiState.value.selectedSession?.sessionId)
    }

    @Test
    fun reconnectClearsTranscriptBeforeReplay() = runTest(dispatcher) {
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            connection = connection,
        )

        advanceUntilIdle()
        connection.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_02"),
        )
        viewModel.onComposerTextChanged("first")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.transcript.rows.size)

        connection.triggerReconnect()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.streamReconnecting)
        assertEquals(0, viewModel.uiState.value.transcript.rows.size)
        assertEquals(SessionState.Offline, viewModel.uiState.value.effectiveSessionState)
    }

    @Test
    fun permissionRequestUpdatesPendingState() = runTest(dispatcher) {
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            connection = connection,
        )

        advanceUntilIdle()
        connection.emit(
            SessionStreamServerMessage.PermissionRequest(
                requestId = "perm_01",
                agentId = "cursor",
                sessionId = "sess_02",
                params = JsonObject(
                    mapOf(
                        "toolName" to JsonPrimitive("fake-tool"),
                        "options" to kotlinx.serialization.json.JsonArray(
                            listOf(
                                JsonObject(
                                    mapOf(
                                        "optionId" to JsonPrimitive("allow-once"),
                                        "name" to JsonPrimitive("Allow once"),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals("fake-tool", viewModel.uiState.value.activePermissionRequest?.toolName)
        viewModel.submitPermissionOption("allow-once")
        advanceUntilIdle()
        assertTrue(
            connection.sent.any { message ->
                message is SessionStreamClientMessage.PermissionReply &&
                    message.optionId == "allow-once"
            },
        )
    }

    @Test
    fun recentMenuTakesFiveNewestByUpdatedAt() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(
            extraSessions = (1..8).map { index ->
                session(
                    id = "sess_$index",
                    title = "S$index",
                    updatedAt = "2026-08-05T0$index:00:00.000Z",
                )
            },
        )
        val viewModel = createViewModel(repository, ChatFakeNavigationPreferences())

        advanceUntilIdle()
        viewModel.showPicker()
        advanceUntilIdle()

        assertEquals(5, viewModel.uiState.value.recentSessions.size)
        assertEquals("S8", viewModel.uiState.value.recentSessions.first().name)
    }

    @Test
    fun sessionsSearchFiltersTitlesClientSide() = runTest(dispatcher) {
        val viewModel = createViewModel(
            ChatFakeOperatorRepository(),
            ChatFakeNavigationPreferences(),
        )

        advanceUntilIdle()
        viewModel.openSessionsList()
        advanceUntilIdle()
        viewModel.onSessionsSearchChanged("alp")
        advanceUntilIdle()

        assertEquals(listOf("Alpha"), viewModel.uiState.value.sessionsList.map { it.name })
    }

    private fun createViewModel(
        repository: ChatFakeOperatorRepository,
        navigation: ChatFakeNavigationPreferences,
        connection: ChatFakeConnectionGateway = ChatFakeConnectionGateway(),
    ): ChatViewModel = ChatViewModel(
        savedStateHandle = SavedStateHandle(),
        sessionGateway = ChatFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
        connectionGateway = connection,
        operatorRepository = repository,
        navigationPreferences = navigation,
        voiceDictationController = VoiceDictationController(FakeSpeechRecognitionClient()),
    )

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

    override suspend fun clearLocalAccess() {
        _pairedState.value = PairedState.NotPaired
    }
}

private class ChatFakeConnectionGateway : ConnectionGateway {
    private val _state = MutableStateFlow(ConnectionState())
    override val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<SessionStreamServerMessage>(extraBufferCapacity = 64)
    override val messages: SharedFlow<SessionStreamServerMessage> = _messages.asSharedFlow()

    private val _streamResets = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    override val streamResets: SharedFlow<Unit> = _streamResets.asSharedFlow()

    val sent = mutableListOf<SessionStreamClientMessage>()
    var target: Pair<String, String>? = null
        private set

    override fun connect(serverOrigin: String) = Unit
    override fun retry() = Unit
    override fun disconnect() = Unit

    override fun send(message: SessionStreamClientMessage) {
        sent += message
    }

    override fun setTarget(agentId: AgentId?, sessionId: String?) {
        target = if (agentId == null || sessionId == null) {
            null
        } else {
            agentId to sessionId
        }
    }

    fun emit(message: SessionStreamServerMessage) {
        check(_messages.tryEmit(message))
    }

    fun triggerReconnect() {
        check(_streamResets.tryEmit(Unit))
    }
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

    override suspend fun clearLastSessionId() {
        savedSessionId = null
    }
}

private class ChatFakeOperatorRepository(
    private val deleteConflict: Boolean = false,
    extraSessions: List<Session> = emptyList(),
) : OperatorRepository {
    val createCalls = mutableListOf<CreateSessionBody>()
    val deleteCalls = mutableListOf<Pair<String, String>>()
    private val createdSessions = mutableListOf<Session>()
    private val seed = extraSessions.ifEmpty {
        listOf(
            session("sess_02", "Alpha", updatedAt = "2026-08-05T02:00:00.000Z"),
            session("sess_01", "Beta", updatedAt = "2026-08-05T01:00:00.000Z"),
        )
    }

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ) = Result.success(
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

    override suspend fun getRuntimeSettings(serverOrigin: String) =
        Result.failure<server.agent.android.contracts.RuntimeSettingsView>(UnsupportedOperationException())

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ) = Result.failure<server.agent.android.contracts.FilesystemDirectoryCollection>(
        UnsupportedOperationException(),
    )

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: server.agent.android.contracts.CreateWorkspaceBody,
    ) = Result.failure<Workspace>(UnsupportedOperationException())

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<SessionCollection> = Result.success(
        SessionCollection(items = createdSessions + seed),
    )

    override suspend fun listAgents(serverOrigin: String) = Result.success(
        AgentSettingsCollection(
            items = listOf(
                AgentSettings(
                    id = "cursor",
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
        val created = session("sess_new", "New session", updatedAt = "2026-08-05T03:00:00.000Z")
        createdSessions += created
        return Result.success(created)
    }

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
    ): Result<Unit> {
        deleteCalls += agentId to sessionId
        if (deleteConflict) {
            return Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 409,
                        title = "Conflict",
                        detail = "Agent is disabled",
                    ),
                ),
            )
        }
        return Result.success(Unit)
    }
}

private fun session(
    id: String,
    title: String,
    updatedAt: String = "2026-08-05T01:00:00.000Z",
): Session = Session(
    agentId = "cursor",
    sessionId = id,
    cwd = "/tmp/agent-server",
    title = title,
    updatedAt = updatedAt,
)
