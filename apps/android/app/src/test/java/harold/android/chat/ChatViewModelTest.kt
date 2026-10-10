package harold.android.chat

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
import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentReference
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentUploadRequest
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.AttachmentApi
import harold.android.network.SessionConfigApi
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.BooleanOption
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.PageInfo
import harold.android.contracts.PermissionOption
import harold.android.contracts.PermissionRequest
import harold.android.contracts.PermissionStatus
import harold.android.contracts.SelectOption
import harold.android.contracts.Session
import harold.android.contracts.SessionCollection
import harold.android.contracts.SessionState
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceState
import harold.android.stream.ConnectionState
import harold.android.live.SessionOwner
import harold.android.live.SessionSnapshot
import harold.android.navigation.NavigationPreferences
import harold.android.operator.OperatorRepository
import harold.android.session.PairedState
import harold.android.session.SessionGateway

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
        assertEquals("/tmp/harold", repository.createCalls.first().cwd)
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
    fun liveSnapshotMapsComposerConfig() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                configOptions = listOf(
                    SelectOption(
                        id = "model",
                        name = "Model",
                        category = "model",
                        currentValue = "m2",
                        options = listOf(ConfigOptionValue(value = "m2", name = "M2")),
                    ),
                    BooleanOption(
                        id = "thinking",
                        name = "Thinking",
                        category = "thought_level",
                        currentValue = true,
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        val config = viewModel.uiState.value.composerConfig
        assertEquals("m2", (config.model as SelectOption).currentValue)
        assertNull(config.mode)
        assertTrue((config.thinking as BooleanOption).currentValue)
    }

    @Test
    fun modelPickAppliesOptimisticallyAndCallsTheApi() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val configApi = RecordingSessionConfigApi()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
            configApi = configApi,
        )

        advanceUntilIdle()
        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                agentId = "cursor",
                sessionId = "sess_02",
                configOptions = listOf(modelOption(currentValue = "m1")),
            ),
        )
        advanceUntilIdle()

        viewModel.onModelPick("m2")
        advanceUntilIdle()

        assertEquals(
            "m2",
            (viewModel.uiState.value.composerConfig.model as SelectOption).currentValue,
        )
        assertTrue(viewModel.uiState.value.composerConfig.saving)
        assertEquals(
            listOf(
                RecordingSessionConfigApi.Call(
                    serverOrigin = ORIGIN,
                    agentId = "cursor",
                    sessionId = "sess_02",
                    configId = "model",
                    value = ConfigValue.Text("m2"),
                ),
            ),
            configApi.calls,
        )
    }

    @Test
    fun configEchoSettlesTheOptimisticPick() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                agentId = "cursor",
                sessionId = "sess_02",
                configOptions = listOf(modelOption(currentValue = "m1")),
            ),
        )
        advanceUntilIdle()

        viewModel.onModelPick("m2")
        advanceUntilIdle()
        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                configOptions = listOf(modelOption(currentValue = "m2")),
            ),
        )
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.composerConfig.saving)
        assertEquals(
            "m2",
            (viewModel.uiState.value.composerConfig.model as SelectOption).currentValue,
        )
    }

    @Test
    fun modeCycleUsesTheReservedOptionId() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val configApi = RecordingSessionConfigApi()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
            configApi = configApi,
        )

        advanceUntilIdle()
        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                agentId = "cursor",
                sessionId = "sess_02",
                configOptions = listOf(
                    SelectOption(
                        id = "mode",
                        name = "Mode",
                        category = "mode",
                        currentValue = "ask",
                        options = listOf(ConfigOptionValue(value = "ask", name = "Ask")),
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        viewModel.onModeCycle(ConfigOptionValue(value = "plan", name = "Plan"))
        advanceUntilIdle()

        assertEquals("mode", configApi.calls.single().configId)
        assertEquals(ConfigValue.Text("plan"), configApi.calls.single().value)
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
            agentAuth = harold.android.contracts.AgentAuth(
                agentId = "cursor",
                status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
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
            harold.android.contracts.AgentAuthStatus.NeedsAuth,
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

        val auth = harold.android.contracts.AgentAuth(
            agentId = "cursor",
            status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
            error = null,
            session = harold.android.contracts.AgentAuthSession(
                sessionId = "auth-1",
                agentId = "cursor",
                status = harold.android.contracts.AuthSessionStatus.InProgress,
                steps = listOf(
                    harold.android.contracts.AuthStep.ShowMessage(
                        level = harold.android.contracts.AuthShowMessageLevel.Info,
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
            agentAuth = harold.android.contracts.AgentAuth(
                agentId = "cursor",
                status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
                error = null,
                session = null,
            ),
            startSession = harold.android.contracts.AgentAuthSession(
                sessionId = "auth-1",
                agentId = "cursor",
                status = harold.android.contracts.AuthSessionStatus.InProgress,
                steps = listOf(
                    harold.android.contracts.AuthStep.Confirm(
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
        val inProgress = harold.android.contracts.AgentAuthSession(
            sessionId = "auth-1",
            agentId = "cursor",
            status = harold.android.contracts.AuthSessionStatus.InProgress,
            steps = listOf(
                harold.android.contracts.AuthStep.Confirm(
                    stepId = "confirm-1",
                    title = "Ready?",
                    body = "Finish login",
                    confirmLabel = "I have logged in",
                ),
            ),
            error = null,
        )
        val repository = ChatFakeOperatorRepository(
            agentAuth = harold.android.contracts.AgentAuth(
                agentId = "cursor",
                status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
                error = null,
                session = inProgress,
            ),
            actionSession = inProgress.copy(
                steps = listOf(
                    harold.android.contracts.AuthStep.Working(label = "Checking…"),
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
            harold.android.contracts.AuthSessionAction.Confirm("confirm-1"),
            repository.authActionCalls.single().third,
        )

        viewModel.onAuthCancel()
        advanceUntilIdle()
        assertEquals(2, repository.authActionCalls.size)
        assertEquals(
            harold.android.contracts.AuthSessionAction.Cancel,
            repository.authActionCalls.last().third,
        )
    }

    @Test
    fun authLogoutWhenCanLogout() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(
            agentAuth = harold.android.contracts.AgentAuth(
                agentId = "cursor",
                status = harold.android.contracts.AgentAuthStatus.Authenticated,
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
            harold.android.contracts.AgentAuthStatus.NeedsAuth,
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
                    harold.android.contracts.AvailableCommand(
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
            agentAuth = harold.android.contracts.AgentAuth(
                agentId = "cursor",
                status = harold.android.contracts.AgentAuthStatus.Unknown,
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

        repository.agentAuthOverride = harold.android.contracts.AgentAuth(
            agentId = "cursor",
            status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
            error = null,
            session = harold.android.contracts.AgentAuthSession(
                sessionId = "auth-req",
                agentId = "cursor",
                status = harold.android.contracts.AuthSessionStatus.InProgress,
                steps = listOf(
                    harold.android.contracts.AuthStep.ShowMessage(
                        level = harold.android.contracts.AuthShowMessageLevel.Info,
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
                    harold.android.contracts.AvailableCommand(
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
        configApi: SessionConfigApi = RecordingSessionConfigApi(),
        attachmentApi: AttachmentApi = NoopAttachmentApi(),
    ): ChatViewModel = ChatViewModel(
        savedStateHandle = SavedStateHandle(),
        sessionGateway = sessionGateway,
        sessionOwner = sessionOwner,
        operatorRepository = repository,
        attachmentApi = attachmentApi,
        configApi = configApi,
        navigationPreferences = navigation,
        voiceDictationController = VoiceDictationController(
            speechClient = FakeSpeechRecognitionClient(),
            silenceScheduler = ImmediateVoiceDictationRestartScheduler(),
            restartScheduler = ImmediateVoiceDictationRestartScheduler(),
        ),
    )

    @Test
    fun attachmentUploadsToTheSelectedSessionWithoutNamingAWorkspace() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(
            extraSessions = listOf(session("sess_09", "Elsewhere", cwd = "/tmp/not-a-workspace")),
        )
        val attachments = RecordingAttachmentApi()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_09"),
            attachmentApi = attachments,
        )
        advanceUntilIdle()
        assertEquals("", viewModel.uiState.value.selectedSession?.workspaceId)

        viewModel.onAttachmentsPicked(listOf(AttachmentPick("notes.txt", "text/plain", byteArrayOf(1))))
        advanceUntilIdle()

        val upload = attachments.uploads.single()
        assertEquals("cursor", upload.agentId)
        assertEquals("sess_09", upload.sessionId)
        assertEquals(
            AttachmentUploadStatus.Ready,
            viewModel.uiState.value.pendingAttachments.single().status,
        )
    }

    @Test
    fun removingAnUploadedAttachmentDeletesItFromTheSession() = runTest(dispatcher) {
        val attachments = RecordingAttachmentApi()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            attachmentApi = attachments,
        )
        advanceUntilIdle()
        viewModel.onAttachmentsPicked(listOf(AttachmentPick("notes.txt", "text/plain", byteArrayOf(1))))
        advanceUntilIdle()

        viewModel.removeAttachment(viewModel.uiState.value.pendingAttachments.single().localId)
        advanceUntilIdle()

        assertEquals(listOf(Triple("cursor", "sess_02", "att_1")), attachments.deletes)
        assertTrue(viewModel.uiState.value.pendingAttachments.isEmpty())
    }

    @Test
    fun attachingInADraftCreatesTheSessionOnceThenUploadsEveryFile() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val attachments = RecordingAttachmentApi()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            attachmentApi = attachments,
        )
        advanceUntilIdle()
        viewModel.showCreateDialog()
        advanceUntilIdle()
        viewModel.onCreateWorkspaceChanged("ws_01")
        viewModel.onCreateAgentChanged("cursor")
        viewModel.confirmNewSession()
        advanceUntilIdle()
        assertEquals("", viewModel.uiState.value.selectedSession?.sessionId)

        viewModel.onAttachmentsPicked(
            listOf(
                AttachmentPick("a.txt", "text/plain", byteArrayOf(1)),
                AttachmentPick("b.txt", "text/plain", byteArrayOf(2)),
            ),
        )
        advanceUntilIdle()

        assertEquals(1, repository.createCalls.size)
        assertEquals(listOf("sess_new", "sess_new"), attachments.uploads.map { it.sessionId })
        assertEquals("sess_new", viewModel.uiState.value.selectedSession?.sessionId)
        assertTrue(
            viewModel.uiState.value.pendingAttachments.all { it.status == AttachmentUploadStatus.Ready },
        )
    }

    @Test
    fun attachmentFailsWithTheServerReasonWhenTheSessionFolderIsNotAllowed() = runTest(dispatcher) {
        val attachments = object : AttachmentApi {
            override suspend fun uploadAttachment(
                serverOrigin: String,
                request: AttachmentUploadRequest,
            ): Result<AttachmentDescriptor> = Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 409,
                        title = "Session folder not allowed",
                        detail = "The session folder is outside the allowed roots",
                    ),
                ),
            )

            override suspend fun deleteAttachment(
                serverOrigin: String,
                agentId: String,
                sessionId: String,
                attachmentId: String,
            ): Result<Unit> = Result.success(Unit)
        }
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            attachmentApi = attachments,
        )
        advanceUntilIdle()

        viewModel.onAttachmentsPicked(listOf(AttachmentPick("notes.txt", "text/plain", byteArrayOf(1))))
        advanceUntilIdle()

        val pending = viewModel.uiState.value.pendingAttachments.single()
        assertEquals(AttachmentUploadStatus.Failed, pending.status)
        assertEquals("The session folder is outside the allowed roots", pending.error)
    }

    private fun modelOption(currentValue: String): SelectOption = SelectOption(
        id = "model",
        name = "Model",
        category = "model",
        currentValue = currentValue,
        options = listOf(ConfigOptionValue(value = currentValue, name = currentValue)),
    )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private class RecordingSessionConfigApi : SessionConfigApi {
    data class Call(
        val serverOrigin: String,
        val agentId: String,
        val sessionId: String,
        val configId: String,
        val value: ConfigValue,
    )

    val calls = mutableListOf<Call>()

    override suspend fun setConfigOption(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit> {
        calls += Call(serverOrigin, agentId, sessionId, configId, value)
        return Result.success(Unit)
    }
}

private class NoopAttachmentApi : AttachmentApi {

    override suspend fun uploadAttachment(
        serverOrigin: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor> = Result.failure(UnsupportedOperationException("not used"))

    override suspend fun deleteAttachment(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        attachmentId: String,
    ): Result<Unit> = Result.success(Unit)
}

private class RecordingAttachmentApi : AttachmentApi {
    val uploads = mutableListOf<AttachmentUploadRequest>()
    val deletes = mutableListOf<Triple<String, String, String>>()

    override suspend fun uploadAttachment(
        serverOrigin: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor> {
        uploads += request
        return Result.success(
            AttachmentDescriptor(
                id = "att_${uploads.size}",
                name = request.fileName,
                mimeType = request.mimeType,
                kind = request.kind ?: harold.android.contracts.AttachmentKind.File,
                size = request.bytes.size.toLong(),
                path = "/tmp/harold/.harold/attachments/att_${uploads.size}.txt",
            ),
        )
    }

    override suspend fun deleteAttachment(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        attachmentId: String,
    ): Result<Unit> {
        deletes += Triple(agentId, sessionId, attachmentId)
        return Result.success(Unit)
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

    override fun prompt(text: String, attachments: List<AttachmentReference>) {
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
    agentAuth: harold.android.contracts.AgentAuth = harold.android.contracts.AgentAuth(
        agentId = "cursor",
        status = harold.android.contracts.AgentAuthStatus.Unknown,
        error = null,
        session = null,
    ),
    private val startSession: harold.android.contracts.AgentAuthSession? = null,
    private val actionSession: harold.android.contracts.AgentAuthSession? = null,
    var canLogout: Boolean = false,
) : OperatorRepository {
    val createCalls = mutableListOf<CreateSessionBody>()
    val deleteCalls = mutableListOf<Pair<String, String>>()
    val authGetCalls = mutableListOf<String>()
    val authStartCalls = mutableListOf<String>()
    val authActionCalls = mutableListOf<Triple<String, String, harold.android.contracts.AuthSessionAction>>()
    val authLogoutCalls = mutableListOf<String>()
    val revokeDeviceCalls = mutableListOf<String>()
    var agentAuthOverride: harold.android.contracts.AgentAuth = agentAuth
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
                    name = "harold",
                    path = "/tmp/harold",
                    state = WorkspaceState.Available,
                    createdAt = "2026-08-05T00:00:00.000Z",
                    lastUsedAt = "2026-08-05T00:00:00.000Z",
                ),
            ),
            page = PageInfo(limit = 100, count = 1),
        ),
    )

    override suspend fun getRuntimeSettings(serverOrigin: String) =
        Result.failure<harold.android.contracts.RuntimeSettingsView>(UnsupportedOperationException())

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCollection>(
        UnsupportedOperationException(),
    )

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: harold.android.contracts.CreateWorkspaceBody,
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
                    authSummary = harold.android.contracts.AgentAuthSummary(
                        status = agentAuthOverride.status,
                        error = agentAuthOverride.error,
                        activeSessionId = agentAuthOverride.session
                            ?.takeIf {
                                it.status == harold.android.contracts.AuthSessionStatus.InProgress
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
    ): Result<harold.android.contracts.AgentAuth> {
        authGetCalls += agentId
        return Result.success(agentAuthOverride.copy(agentId = agentId))
    }

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: String,
    ): Result<harold.android.contracts.AgentAuthSession> {
        authStartCalls += agentId
        val session = startSession ?: return Result.failure(UnsupportedOperationException())
        agentAuthOverride = agentAuthOverride.copy(
            status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
            session = session,
        )
        return Result.success(session)
    }

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        action: harold.android.contracts.AuthSessionAction,
    ): Result<harold.android.contracts.AgentAuthSession> {
        authActionCalls += Triple(agentId, sessionId, action)
        val session = when (action) {
            is harold.android.contracts.AuthSessionAction.Cancel -> {
                (actionSession ?: agentAuthOverride.session)?.copy(
                    status = harold.android.contracts.AuthSessionStatus.Cancelled,
                    steps = listOf(
                        harold.android.contracts.AuthStep.Done(
                            outcome = harold.android.contracts.AuthDoneOutcome.Cancelled,
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
    ): Result<harold.android.contracts.AgentAuthSummary> {
        authLogoutCalls += agentId
        val summary = harold.android.contracts.AgentAuthSummary(
            status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
            error = null,
            activeSessionId = null,
            canLogout = false,
        )
        agentAuthOverride = harold.android.contracts.AgentAuth(
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
    cwd: String = "/tmp/harold",
): Session = Session(
    agentId = "cursor",
    sessionId = id,
    cwd = cwd,
    title = title,
    updatedAt = updatedAt,
)
