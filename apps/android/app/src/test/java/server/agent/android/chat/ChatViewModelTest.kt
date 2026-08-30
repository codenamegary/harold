package server.agent.android.chat

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonElement
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AgentSettings
import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.PageInfo
import server.agent.android.contracts.PermissionOption
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.PermissionStatus
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionCollection
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection
import server.agent.android.contracts.WorkspaceState
import server.agent.android.events.ConnectionState
import server.agent.android.live.SessionOwner
import server.agent.android.live.SessionSnapshot
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
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()

        assertEquals("Alpha", viewModel.uiState.value.selectedSession?.name)
        assertEquals(2, viewModel.uiState.value.sessions.size)
        assertEquals("cursor" to "sess_02", sessionOwner.target)
    }

    @Test
    fun confirmNewSessionEnablesComposerWithoutCreateCall() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
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
        assertNull(sessionOwner.target)
    }

    @Test
    fun firstComposerSendCreatesSessionThenPrompts() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
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
        assertEquals("cursor" to "sess_new", sessionOwner.target)
        assertEquals(listOf("Ship it"), sessionOwner.prompts)
        assertTrue(viewModel.uiState.value.transcript.rows.first() is TranscriptUserRow)
    }

    @Test
    fun streamsTranscriptAndAllowsFollowUpPrompt() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()

        viewModel.onComposerTextChanged("Follow up")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()

        assertEquals(listOf("Follow up"), sessionOwner.prompts)
        assertEquals("", viewModel.uiState.value.composerText)
        assertEquals(SessionState.Running, viewModel.uiState.value.effectiveSessionState)
    }

    @Test
    fun cancelSessionSendsStreamCancel() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        viewModel.onComposerTextChanged("Go")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()
        viewModel.submitCancel()
        advanceUntilIdle()

        assertEquals(1, sessionOwner.cancels)
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
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        viewModel.onComposerTextChanged("first")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.transcript.rows.size)

        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                transcript = applyReconnect(),
                reconnecting = true,
            ),
        )
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.streamReconnecting)
        assertEquals(0, viewModel.uiState.value.transcript.rows.size)
        assertEquals(SessionState.Offline, viewModel.uiState.value.effectiveSessionState)
    }

    @Test
    fun permissionRequestUpdatesPendingState() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                pendingPermission = PermissionRequest(
                    id = "perm_01",
                    sessionId = "sess_02",
                    turnId = "stream",
                    toolCallId = "stream",
                    toolName = "fake-tool",
                    status = PermissionStatus.Pending,
                    options = listOf(
                        PermissionOption(optionId = "allow-once", name = "Allow once"),
                    ),
                    createdAt = "",
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals("fake-tool", viewModel.uiState.value.activePermissionRequest?.toolName)
        viewModel.submitPermissionOption("allow-once")
        advanceUntilIdle()
        assertEquals(listOf("perm_01" to "allow-once"), sessionOwner.permissionReplies)
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
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )
        advanceUntilIdle()

        val auth = server.agent.android.contracts.AgentAuth(
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
        )
        sessionOwner.publish(sessionOwner.snapshot.value.copy(agentAuth = auth))
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.showAuthPanel)
        assertEquals("auth-1", viewModel.uiState.value.agentAuth?.session?.sessionId)
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
        val sessionOwner = ChatFakeSessionOwner()
        val navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02")
        val viewModel = createViewModel(
            repository = repository,
            navigation = navigation,
            sessionOwner = sessionOwner,
            sessionGateway = sessionGateway,
        )
        advanceUntilIdle()

        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                availableCommands = listOf(
                    server.agent.android.contracts.AvailableCommand(
                        name = "plan",
                        description = "Draft a plan",
                    ),
                ),
            ),
        )
        advanceUntilIdle()
        assertEquals(
            listOf("plan"),
            viewModel.uiState.value.availableCommands.map { command -> command.name },
        )

        viewModel.disconnectFromServer()
        advanceUntilIdle()

        assertEquals(listOf("device_01"), repository.revokeDeviceCalls)
        assertEquals(PairedState.NotPaired, sessionGateway.pairedState.value)
        assertTrue(navigation.lastSessionCleared)
        assertEquals(1, sessionOwner.disconnects)
        assertTrue(viewModel.uiState.value.availableCommands.isEmpty())
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
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
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

        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                agentId = "cursor",
                sessionId = "sess_02",
                authRequired = true,
            ),
        )
        advanceUntilIdle()

        assertTrue(repository.authGetCalls.size > getsBefore)
        assertEquals("auth-req", viewModel.uiState.value.agentAuth?.session?.sessionId)
        assertTrue(viewModel.uiState.value.showAuthPanel)
    }

    @Test
    fun commandsUpdatePopulatesStateWithoutTouchingTranscriptAndRestoresOnSwitchBack() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )
        advanceUntilIdle()

        val rowsBefore = viewModel.uiState.value.transcript.rows

        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                availableCommands = listOf(
                    server.agent.android.contracts.AvailableCommand(
                        name = "plan",
                        description = "Draft a plan",
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals(
            listOf("plan"),
            viewModel.uiState.value.availableCommands.map { command -> command.name },
        )
        assertEquals(rowsBefore, viewModel.uiState.value.transcript.rows)
    }

    @Test
    fun voiceCommandPickPrefixesSubmittedPrompt() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )
        advanceUntilIdle()

        viewModel.openVoiceDictation(hasRecordAudioPermission = true)
        viewModel.pickVoiceCommand("plan")
        assertEquals("/plan ", viewModel.uiState.value.voiceCommandPrefix)

        // No speech in the fake client, so the transcript stays empty and a
        // bare command prefix is still a sendable message.
        viewModel.submitVoicePrompt()
        advanceUntilIdle()

        assertEquals(listOf("/plan"), sessionOwner.prompts)
        assertFalse(viewModel.uiState.value.voiceDictation.visible)
        assertEquals("", viewModel.uiState.value.voiceCommandPrefix)
    }

    private fun createViewModel(
        repository: ChatFakeOperatorRepository,
        navigation: ChatFakeNavigationPreferences,
        sessionOwner: ChatFakeSessionOwner = ChatFakeSessionOwner(),
        sessionGateway: ChatFakeSessionGateway = ChatFakeSessionGateway(
            PairedState.Paired(ORIGIN, "device_01", "Pixel"),
        ),
    ): ChatViewModel = ChatViewModel(
        savedStateHandle = SavedStateHandle(),
        sessionGateway = sessionGateway,
        sessionOwner = sessionOwner,
        operatorRepository = repository,
        navigationPreferences = navigation,
        voiceDictationController = VoiceDictationController(
            speechClient = FakeSpeechRecognitionClient(),
            silenceScheduler = ImmediateVoiceDictationRestartScheduler(),
            restartScheduler = ImmediateVoiceDictationRestartScheduler(),
        ),
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

private class ChatFakeSessionOwner : SessionOwner {
    private val _connectionState = MutableStateFlow(ConnectionState())
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _snapshot = MutableStateFlow(SessionSnapshot())
    override val snapshot: StateFlow<SessionSnapshot> = _snapshot.asStateFlow()

    val prompts = mutableListOf<String>()
    val permissionReplies = mutableListOf<Pair<String, String>>()
    var cancels = 0
        private set
    var disconnects = 0
        private set
    var target: Pair<String, String>? = null
        private set

    fun publish(snapshot: SessionSnapshot) {
        _snapshot.value = snapshot
    }

    override fun connect(serverOrigin: String) = Unit
    override fun retry() = Unit

    override fun disconnect() {
        disconnects += 1
        target = null
        _snapshot.value = SessionSnapshot()
    }

    override fun watch(agentId: AgentId?, sessionId: String?) {
        val nextTarget = if (agentId == null || sessionId.isNullOrEmpty()) {
            null
        } else {
            agentId to sessionId
        }
        if (target == nextTarget) {
            return
        }
        target = nextTarget
        _snapshot.update { current ->
            current.copy(
                agentId = agentId,
                sessionId = sessionId?.takeIf { it.isNotEmpty() },
                transcript = emptyAcpTranscript,
                reconnecting = false,
                availableCommands = emptyList(),
                pendingPermission = null,
                extension = null,
                authRequired = false,
            )
        }
    }

    override fun prompt(text: String) {
        prompts += text
        val turnId = "turn-${prompts.size}"
        _snapshot.update { current ->
            current.copy(transcript = beginUserTurn(current.transcript, turnId, text))
        }
    }

    override fun cancel() {
        cancels += 1
    }

    override fun replyPermission(requestId: String, optionId: String) {
        permissionReplies += requestId to optionId
        _snapshot.update { current -> current.copy(pendingPermission = null) }
    }

    override fun replyExtension(requestId: String, result: JsonElement) {
        _snapshot.update { current -> current.copy(extension = null) }
    }

    override fun forget(agentId: AgentId, sessionId: String) = Unit
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
