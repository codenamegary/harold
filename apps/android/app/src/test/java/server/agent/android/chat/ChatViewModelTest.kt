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
import org.junit.Assert.assertNull
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
    fun confirmNewSessionEnablesComposerWithoutCreateCall() = runTest(dispatcher) {
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
        viewModel.confirmNewSession()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.createDialogVisible)
        assertTrue(repository.createCalls.isEmpty())
        assertEquals("New session", viewModel.uiState.value.selectedSession?.name)
        assertEquals("", viewModel.uiState.value.selectedSession?.sessionId)
        assertTrue(viewModel.uiState.value.composerEnabled)
        assertNull(connection.target)
    }

    @Test
    fun firstComposerSendCreatesSessionThenPromptsAfterSubscribe() = runTest(dispatcher) {
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
        viewModel.confirmNewSession()
        advanceUntilIdle()

        viewModel.onComposerTextChanged("Ship it")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()

        assertEquals(1, repository.createCalls.size)
        assertEquals("/tmp/agent-server", repository.createCalls.first().cwd)
        assertEquals("sess_new", viewModel.uiState.value.selectedSession?.sessionId)
        assertEquals("cursor" to "sess_new", connection.target)

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

    @Test
    fun hydratesAgentAuthWhenSelectingSession() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(
            agentAuth = server.agent.android.contracts.AgentAuth(
                agentId = "cursor",
                status = server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
                error = null,
                session = null,
            ),
        )
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
        )

        advanceUntilIdle()

        assertEquals(
            server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
            viewModel.uiState.value.agentAuth?.status,
        )
        assertEquals(listOf("cursor"), repository.authGetCalls)
    }

    @Test
    fun appliesAuthSessionUpdatedForMatchingAgent() = runTest(dispatcher) {
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            connection = connection,
        )
        advanceUntilIdle()

        connection.emit(
            SessionStreamServerMessage.AuthSessionUpdated(
                agentId = "cursor",
                auth = server.agent.android.contracts.AgentAuth(
                    agentId = "cursor",
                    status = server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
                    error = null,
                    session = server.agent.android.contracts.AgentAuthSession(
                        sessionId = "auth-1",
                        agentId = "cursor",
                        status = server.agent.android.contracts.AuthSessionStatus.InProgress,
                        steps = listOf(
                            server.agent.android.contracts.AuthStep.ShowMessage(
                                level = server.agent.android.contracts.AuthShowMessageLevel.Info,
                                body = "Sign in on the host",
                            ),
                        ),
                        error = null,
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.showAuthPanel)
        assertEquals("auth-1", viewModel.uiState.value.agentAuth?.session?.sessionId)
    }

    @Test
    fun ignoresAuthSessionUpdatedForOtherAgent() = runTest(dispatcher) {
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            connection = connection,
        )
        advanceUntilIdle()
        val before = viewModel.uiState.value.agentAuth

        connection.emit(
            SessionStreamServerMessage.AuthSessionUpdated(
                agentId = "other",
                auth = server.agent.android.contracts.AgentAuth(
                    agentId = "other",
                    status = server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
                    error = null,
                    session = null,
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals(before, viewModel.uiState.value.agentAuth)
    }

    @Test
    fun authSignInStartsSession() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(
            agentAuth = server.agent.android.contracts.AgentAuth(
                agentId = "cursor",
                status = server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
                error = null,
                session = null,
            ),
            startSession = server.agent.android.contracts.AgentAuthSession(
                sessionId = "auth-1",
                agentId = "cursor",
                status = server.agent.android.contracts.AuthSessionStatus.InProgress,
                steps = listOf(
                    server.agent.android.contracts.AuthStep.Confirm(
                        stepId = "confirm-1",
                        title = "Ready?",
                        body = "Finish login",
                        confirmLabel = "I have logged in",
                    ),
                ),
                error = null,
            ),
        )
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
        )
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.showAuthPanel)
        viewModel.onAuthSignIn()
        advanceUntilIdle()

        assertEquals(1, repository.authStartCalls.size)
        assertEquals("auth-1", viewModel.uiState.value.agentAuth?.session?.sessionId)
        assertTrue(viewModel.uiState.value.showAuthPanel)
    }

    @Test
    fun authConfirmAndCancelCallRepository() = runTest(dispatcher) {
        val inProgress = server.agent.android.contracts.AgentAuthSession(
            sessionId = "auth-1",
            agentId = "cursor",
            status = server.agent.android.contracts.AuthSessionStatus.InProgress,
            steps = listOf(
                server.agent.android.contracts.AuthStep.Confirm(
                    stepId = "confirm-1",
                    title = "Ready?",
                    body = "Finish login",
                    confirmLabel = "I have logged in",
                ),
            ),
            error = null,
        )
        val repository = ChatFakeOperatorRepository(
            agentAuth = server.agent.android.contracts.AgentAuth(
                agentId = "cursor",
                status = server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
                error = null,
                session = inProgress,
            ),
            actionSession = inProgress.copy(
                steps = listOf(
                    server.agent.android.contracts.AuthStep.Working(label = "Checking…"),
                ),
            ),
        )
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
        )
        advanceUntilIdle()

        viewModel.onAuthConfirm("confirm-1")
        advanceUntilIdle()
        assertEquals(1, repository.authActionCalls.size)
        assertEquals(
            server.agent.android.contracts.AuthSessionAction.Confirm("confirm-1"),
            repository.authActionCalls.single().third,
        )

        viewModel.onAuthCancel()
        advanceUntilIdle()
        assertEquals(2, repository.authActionCalls.size)
        assertEquals(
            server.agent.android.contracts.AuthSessionAction.Cancel,
            repository.authActionCalls.last().third,
        )
    }

    @Test
    fun authLogoutWhenCanLogout() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(
            agentAuth = server.agent.android.contracts.AgentAuth(
                agentId = "cursor",
                status = server.agent.android.contracts.AgentAuthStatus.Authenticated,
                error = null,
                session = null,
            ),
            canLogout = true,
        )
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
        )
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.authSummary?.canLogout == true)
        viewModel.onAuthLogout()
        advanceUntilIdle()

        assertEquals(listOf("cursor"), repository.authLogoutCalls)
        assertEquals(
            server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
            viewModel.uiState.value.agentAuthSummary?.status,
        )
        assertTrue(viewModel.uiState.value.showAuthPanel)
    }

    @Test
    fun disconnectFromServerRevokesDeviceAndClearsLocalAccess() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val sessionGateway = ChatFakeSessionGateway(
            PairedState.Paired(ORIGIN, "device_01", "Pixel"),
        )
        val connection = ChatFakeConnectionGateway()
        val navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02")
        val viewModel = createViewModel(
            repository = repository,
            navigation = navigation,
            connection = connection,
            sessionGateway = sessionGateway,
        )
        advanceUntilIdle()

        viewModel.disconnectFromServer()
        advanceUntilIdle()

        assertEquals(listOf("device_01"), repository.revokeDeviceCalls)
        assertEquals(PairedState.NotPaired, sessionGateway.pairedState.value)
        assertTrue(navigation.lastSessionCleared)
        assertNull(connection.target)
    }

    @Test
    fun authRequiredStreamErrorHydratesAuth() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(
            agentAuth = server.agent.android.contracts.AgentAuth(
                agentId = "cursor",
                status = server.agent.android.contracts.AgentAuthStatus.Unknown,
                error = null,
                session = null,
            ),
        )
        val connection = ChatFakeConnectionGateway()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            connection = connection,
        )
        advanceUntilIdle()
        val getsBefore = repository.authGetCalls.size

        repository.agentAuthOverride = server.agent.android.contracts.AgentAuth(
            agentId = "cursor",
            status = server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
            error = null,
            session = server.agent.android.contracts.AgentAuthSession(
                sessionId = "auth-req",
                agentId = "cursor",
                status = server.agent.android.contracts.AuthSessionStatus.InProgress,
                steps = listOf(
                    server.agent.android.contracts.AuthStep.ShowMessage(
                        level = server.agent.android.contracts.AuthShowMessageLevel.Info,
                        body = "Host login required",
                    ),
                ),
                error = null,
            ),
        )

        connection.emit(
            SessionStreamServerMessage.Error(
                message = "Agent authentication required",
                agentId = "cursor",
                sessionId = "sess_02",
            ),
        )
        advanceUntilIdle()

        assertTrue(repository.authGetCalls.size > getsBefore)
        assertEquals("auth-req", viewModel.uiState.value.agentAuth?.session?.sessionId)
        assertTrue(viewModel.uiState.value.showAuthPanel)
    }

    private fun createViewModel(
        repository: ChatFakeOperatorRepository,
        navigation: ChatFakeNavigationPreferences,
        connection: ChatFakeConnectionGateway = ChatFakeConnectionGateway(),
        sessionGateway: ChatFakeSessionGateway = ChatFakeSessionGateway(
            PairedState.Paired(ORIGIN, "device_01", "Pixel"),
        ),
    ): ChatViewModel = ChatViewModel(
        savedStateHandle = SavedStateHandle(),
        sessionGateway = sessionGateway,
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
    var lastSessionCleared: Boolean = false
        private set

    override suspend fun loadLastSessionId(): String? = lastSessionId

    override suspend fun saveLastSessionId(sessionId: String) {
        savedSessionId = sessionId
        lastSessionCleared = false
    }

    override suspend fun clearLastSessionId() {
        savedSessionId = null
        lastSessionCleared = true
    }
}

private class ChatFakeOperatorRepository(
    private val deleteConflict: Boolean = false,
    extraSessions: List<Session> = emptyList(),
    agentAuth: server.agent.android.contracts.AgentAuth = server.agent.android.contracts.AgentAuth(
        agentId = "cursor",
        status = server.agent.android.contracts.AgentAuthStatus.Unknown,
        error = null,
        session = null,
    ),
    private val startSession: server.agent.android.contracts.AgentAuthSession? = null,
    private val actionSession: server.agent.android.contracts.AgentAuthSession? = null,
    var canLogout: Boolean = false,
) : OperatorRepository {
    val createCalls = mutableListOf<CreateSessionBody>()
    val deleteCalls = mutableListOf<Pair<String, String>>()
    val authGetCalls = mutableListOf<String>()
    val authStartCalls = mutableListOf<String>()
    val authActionCalls = mutableListOf<Triple<String, String, server.agent.android.contracts.AuthSessionAction>>()
    val authLogoutCalls = mutableListOf<String>()
    val revokeDeviceCalls = mutableListOf<String>()
    var agentAuthOverride: server.agent.android.contracts.AgentAuth = agentAuth
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
                    authSummary = server.agent.android.contracts.AgentAuthSummary(
                        status = agentAuthOverride.status,
                        error = agentAuthOverride.error,
                        activeSessionId = agentAuthOverride.session
                            ?.takeIf {
                                it.status == server.agent.android.contracts.AuthSessionStatus.InProgress
                            }
                            ?.sessionId,
                        canLogout = canLogout,
                    ),
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

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: String,
    ): Result<server.agent.android.contracts.AgentAuth> {
        authGetCalls += agentId
        return Result.success(agentAuthOverride.copy(agentId = agentId))
    }

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: String,
    ): Result<server.agent.android.contracts.AgentAuthSession> {
        authStartCalls += agentId
        val session = startSession ?: return Result.failure(UnsupportedOperationException())
        agentAuthOverride = agentAuthOverride.copy(
            status = server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
            session = session,
        )
        return Result.success(session)
    }

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        action: server.agent.android.contracts.AuthSessionAction,
    ): Result<server.agent.android.contracts.AgentAuthSession> {
        authActionCalls += Triple(agentId, sessionId, action)
        val session = when (action) {
            is server.agent.android.contracts.AuthSessionAction.Cancel -> {
                (actionSession ?: agentAuthOverride.session)?.copy(
                    status = server.agent.android.contracts.AuthSessionStatus.Cancelled,
                    steps = listOf(
                        server.agent.android.contracts.AuthStep.Done(
                            outcome = server.agent.android.contracts.AuthDoneOutcome.Cancelled,
                            message = null,
                        ),
                    ),
                )
            }
            else -> actionSession
        } ?: return Result.failure(UnsupportedOperationException())
        agentAuthOverride = agentAuthOverride.copy(session = session)
        return Result.success(session)
    }

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: String,
    ): Result<server.agent.android.contracts.AgentAuthSummary> {
        authLogoutCalls += agentId
        val summary = server.agent.android.contracts.AgentAuthSummary(
            status = server.agent.android.contracts.AgentAuthStatus.NeedsAuth,
            error = null,
            activeSessionId = null,
            canLogout = false,
        )
        agentAuthOverride = server.agent.android.contracts.AgentAuth(
            agentId = agentId,
            status = summary.status,
            error = null,
            session = null,
        )
        canLogout = false
        return Result.success(summary)
    }

    override suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ): Result<Unit> {
        revokeDeviceCalls += deviceId
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
