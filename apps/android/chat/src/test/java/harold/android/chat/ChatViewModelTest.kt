package harold.android.chat

import androidx.lifecycle.SavedStateHandle
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentReference
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.BooleanOption
import harold.android.contracts.ConfigOption
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.GitChanges
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitRepository
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktreeCollection
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
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
import harold.android.database.session.CachedSession
import harold.android.database.session.SessionRepository
import harold.android.live.SessionOwner
import harold.android.live.SessionSnapshot
import harold.android.live.TranscriptUserRow
import harold.android.live.applyReconnect
import harold.android.live.beginUserTurn
import harold.android.live.emptyAcpTranscript
import harold.android.navigation.NavigationPreferences
import harold.android.navigation.Navigator
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.AttachmentApi
import harold.android.network.GitApi
import harold.android.network.SessionConfigApi
import harold.android.session.HaroldConnection
import harold.android.session.HaroldConnectionStatus
import harold.android.session.PairedState
import harold.android.testing.FakeCredentialStore
import harold.android.session.SessionGateway
import harold.android.stream.ConnectionState
import harold.android.testing.FakeSessionGateway
import harold.android.testing.FakeSpeechRecognitionClient
import harold.android.user.UserRepository
import harold.android.voice.ImmediateVoiceDictationRestartScheduler
import harold.android.voice.VoiceDictationController
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val sessionCommands = DefaultSessionCommands()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun tellsConnectionsWhichSessionsAreLiveOnThePairedHarold() = runTest(dispatcher) {
        val reported = mutableListOf<Pair<String, List<harold.android.contracts.SessionState>>>()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(),
            haroldConnections = RecordingHaroldConnections(reported),
        )

        advanceUntilIdle()

        assertEquals(
            ORIGIN to listOf(
                harold.android.contracts.SessionState.Idle,
                harold.android.contracts.SessionState.Idle,
            ),
            reported.last(),
        )
        assertEquals(2, viewModel.uiState.value.sessions.size)
    }

    @Test
    fun paintsCachedSessionsBeforeTheRefreshCompletes() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        val repository = ChatFakeUserRepository(sessionsGate = gate)
        val cached = CachedSession(
            serverOrigin = ORIGIN,
            session = session("sess_cached", "Cached"),
            workspaceId = "ws_01",
            workspaceName = "harold",
            agentLabel = "Cursor",
        )
        val sessionRepository = TestSessionRepository(repository).apply {
            seed(listOf(cached))
        }
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            sessionRepository = sessionRepository,
        )

        advanceUntilIdle()

        val loading = viewModel.uiState.value
        assertTrue(loading.hasLoaded)
        assertTrue(loading.isRefreshing)
        assertEquals(listOf("Cached"), loading.sessions.map { row -> row.name })

        gate.complete(Unit)
        advanceUntilIdle()

        val refreshed = viewModel.uiState.value
        assertFalse(refreshed.isRefreshing)
        assertEquals(listOf("Alpha", "Beta"), refreshed.sessions.map { row -> row.name })
    }

    @Test
    fun resumeSignalsTheSessionOwnerProbe() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
        )
        advanceUntilIdle()

        viewModel.onResume()
        viewModel.onBackground()

        assertEquals(1, sessionOwner.foregroundProbes)
        assertEquals(1, sessionOwner.backgroundMarks)
    }

    @Test
    fun openingASessionConnectsThatHarold() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
        )
        advanceUntilIdle()

        viewModel.selectSession(
            listedSession("sess_desktop", "Beta").copy(
                serverOrigin = "http://desktop.local:3847",
                haroldName = "desktop",
                haroldColorId = "ink",
                haroldIconId = "mark",
            ),
        )
        advanceUntilIdle()

        assertEquals(listOf("http://desktop.local:3847"), sessionOwner.connections)
        assertEquals("cursor" to "sess_desktop", sessionOwner.target)
        assertEquals("desktop", viewModel.uiState.value.selectedSession?.haroldName)
        assertEquals("ink", viewModel.uiState.value.selectedSession?.haroldColorId)
        assertEquals("mark", viewModel.uiState.value.selectedSession?.haroldIconId)
    }

    @Test
    fun unreachableSessionKeepsTheLastTranscriptAndWaitsToSend() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
        )
        advanceUntilIdle()
        val open = listedSession("sess_laptop", "Alpha").copy(
            serverOrigin = "http://laptop.local:3847",
            haroldName = "laptop",
            haroldColorId = "tide",
            haroldIconId = "bolt",
        )
        viewModel.selectSession(open)
        advanceUntilIdle()
        sessionOwner.publish(
            SessionSnapshot(
                agentId = "cursor",
                sessionId = "sess_laptop",
                transcript = harold.android.live.AcpTranscriptState(
                    rows = listOf(harold.android.live.TranscriptUserRow(turnId = "t1", text = "hello")),
                    sessionState = SessionState.Idle,
                    live = true,
                ),
            ),
        )
        advanceUntilIdle()

        viewModel.selectSession(open.copy(haroldReachable = false))
        advanceUntilIdle()

        assertEquals("hello", (viewModel.uiState.value.transcript.rows.single() as harold.android.live.TranscriptUserRow).text)
        assertEquals("cursor" to "sess_laptop", sessionOwner.target)
        assertFalse(viewModel.uiState.value.composerEnabled)
        assertEquals(WAITING_FOR_HAROLD, viewModel.uiState.value.composerBlockedMessage)
        viewModel.onComposerTextChanged("more")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()
        assertTrue(sessionOwner.prompts.isEmpty())
    }

    @Test
    fun closedHaroldLinkKeepsTheSelectedSessionWatching() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val connections = RecordingHaroldConnections(mutableListOf())
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
            haroldConnections = connections,
        )
        advanceUntilIdle()
        val open = listedSession("sess_laptop", "Alpha").copy(
            serverOrigin = "http://laptop.local:3847",
            haroldName = "laptop",
            haroldColorId = "tide",
            haroldIconId = "bolt",
        )
        connections.connections.value = listOf(
            HaroldConnection("http://laptop.local:3847", HaroldConnectionStatus.Connected),
        )
        viewModel.selectSession(open)
        advanceUntilIdle()
        assertEquals("cursor" to "sess_laptop", sessionOwner.target)

        // A link parked in the background is Closed, not Unreachable. It must
        // not clear the watch or block the composer while it reconnects.
        connections.connections.value = listOf(
            HaroldConnection("http://laptop.local:3847", HaroldConnectionStatus.Closed),
        )
        advanceUntilIdle()

        assertEquals("cursor" to "sess_laptop", sessionOwner.target)
        assertTrue(viewModel.uiState.value.composerEnabled)
        assertNull(viewModel.uiState.value.composerBlockedMessage)
    }

    @Test
    fun catalogRefreshKeepsTheUnreachableSessionWatching() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val connections = RecordingHaroldConnections(mutableListOf())
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
            haroldConnections = connections,
        )
        advanceUntilIdle()
        val open = listedSession("sess_laptop", "Alpha").copy(
            serverOrigin = "http://laptop.local:3847",
            haroldName = "laptop",
            haroldColorId = "tide",
            haroldIconId = "bolt",
        )
        connections.connections.value = listOf(
            HaroldConnection("http://laptop.local:3847", HaroldConnectionStatus.Connected),
        )
        viewModel.selectSession(open)
        advanceUntilIdle()
        assertEquals("cursor" to "sess_laptop", sessionOwner.target)

        connections.connections.value = listOf(
            HaroldConnection("http://laptop.local:3847", HaroldConnectionStatus.Unreachable),
        )
        advanceUntilIdle()
        assertEquals("cursor" to "sess_laptop", sessionOwner.target)

        // A catalog refresh repaints the row. The watch must survive until
        // the link reconnects, so a later prompt can be sent immediately.
        viewModel.onResume()
        advanceUntilIdle()
        connections.connections.value = listOf(
            HaroldConnection("http://laptop.local:3847", HaroldConnectionStatus.Connected),
        )
        advanceUntilIdle()

        assertEquals("cursor" to "sess_laptop", sessionOwner.target)
    }

    @Test
    fun sessionListKeepsAnUnreachableHaroldWhileAnotherUpdates() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
        repository.sessionsByOrigin = mapOf(
            "http://laptop.local:3847" to listOf(session("sess_laptop", "Alpha", updatedAt = "2026-08-02T00:00:00.000Z")),
            "http://desktop.local:3847" to listOf(session("sess_desktop", "Beta", updatedAt = "2026-08-03T00:00:00.000Z")),
        )
        val store = FakeCredentialStore()
        store.save(storedHarold("http://laptop.local:3847", "laptop", "tide", "bolt", "device_laptop"))
        store.save(storedHarold("http://desktop.local:3847", "desktop", "ink", "mark", "device_desktop"))
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            savedHaroldRepository = SavedHaroldRepository(store),
        )
        advanceUntilIdle()
        assertEquals(listOf("Beta", "Alpha"), viewModel.uiState.value.sessions.map { row -> row.name })
        assertEquals(listOf("desktop", "laptop"), viewModel.uiState.value.sessions.map { row -> row.haroldName })

        repository.failOrigins = setOf("http://laptop.local:3847")
        repository.sessionsByOrigin = mapOf(
            "http://laptop.local:3847" to listOf(session("sess_laptop", "Alpha", updatedAt = "2026-08-02T00:00:00.000Z")),
            "http://desktop.local:3847" to listOf(
                session("sess_desktop", "Beta", updatedAt = "2026-08-03T00:00:00.000Z"),
                session("sess_new", "Gamma", updatedAt = "2026-08-05T00:00:00.000Z"),
            ),
        )
        viewModel.onResume()
        advanceUntilIdle()

        val sessions = viewModel.uiState.value.sessions
        assertEquals(listOf("Gamma", "Beta", "Alpha"), sessions.map { row -> row.name })
        assertEquals(false, sessions.single { row -> row.name == "Alpha" }.haroldReachable)
        assertEquals(true, sessions.single { row -> row.name == "Gamma" }.haroldReachable)
    }

    @Test
    fun loadsSessionsAndRestoresLastSession() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
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
    fun agentRenamesUpdateTheHeaderTheListAndTheRecentPicker() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        assertEquals("Alpha", viewModel.uiState.value.selectedSession?.name)

        sessionOwner.publishTitles(mapOf("cursor:sess_02" to "Fix the auth flow"))
        advanceUntilIdle()

        assertEquals("Fix the auth flow", viewModel.uiState.value.selectedSession?.name)
        assertEquals(
            "Fix the auth flow",
            viewModel.uiState.value.sessions.first { row -> row.sessionId == "sess_02" }.name,
        )
        assertEquals(
            "Fix the auth flow",
            viewModel.uiState.value.recentSessions.first { row -> row.sessionId == "sess_02" }.name,
        )
    }

    @Test
    fun promptCompletionPullsTheListOnlyTitleWhenTheHeaderShowsTheRawId() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository(
            extraSessions = listOf(
                session("sess_02", "sess_02", updatedAt = "2026-08-05T02:00:00.000Z"),
            ),
        )
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        assertEquals("sess_02", viewModel.uiState.value.selectedSession?.name)

        repository.sessionsOverride = listOf(
            session("sess_02", "Generated by the agent", updatedAt = "2026-08-05T02:00:00.000Z"),
        )
        sessionOwner.completePrompt()
        advanceUntilIdle()

        assertEquals("Generated by the agent", viewModel.uiState.value.selectedSession?.name)
        assertEquals(
            "Generated by the agent",
            viewModel.uiState.value.sessions.first { row -> row.sessionId == "sess_02" }.name,
        )
    }

    @Test
    fun promptCompletionPullsTheListOnlyOncePerSessionWhenTheAgentNeverNamesIt() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository(
            extraSessions = listOf(
                session("sess_02", "sess_02", updatedAt = "2026-08-05T02:00:00.000Z"),
            ),
        )
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        val callsAfterLoad = repository.listSessionsCalls

        sessionOwner.completePrompt()
        advanceUntilIdle()
        sessionOwner.completePrompt()
        advanceUntilIdle()
        sessionOwner.completePrompt()
        advanceUntilIdle()

        assertEquals(callsAfterLoad + 1, repository.listSessionsCalls)
        assertEquals("sess_02", viewModel.uiState.value.selectedSession?.name)
    }

    @Test
    fun promptCompletionLeavesAnAlreadyNamedHeaderAlone() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()

        repository.sessionsOverride = listOf(
            session("sess_02", "Some other title", updatedAt = "2026-08-05T02:00:00.000Z"),
        )
        sessionOwner.completePrompt()
        advanceUntilIdle()

        assertEquals("Alpha", viewModel.uiState.value.selectedSession?.name)
    }

    @Test
    fun createdSessionOpensInChatAndSeedsConfig() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        createSessionThroughRoute(repository)

        assertEquals(1, repository.createCalls.size)
        assertEquals("/tmp/harold", repository.createCalls.first().cwd)
        assertEquals("sess_new", viewModel.uiState.value.selectedSession?.sessionId)
        assertEquals("cursor" to "sess_new", sessionOwner.target)
        assertTrue(viewModel.uiState.value.composerEnabled)

        val (configAgent, configSession, configOptions) = sessionOwner.rememberedConfigs.single()
        assertEquals("cursor", configAgent)
        assertEquals("sess_new", configSession)
        assertEquals(listOf("model"), configOptions.map { option -> option.id })
    }

    @Test
    fun pendingSessionShowsLoginWhenTheAgentNeedsAuth() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository(
            agentAuth = harold.android.contracts.AgentAuth(
                agentId = "cursor",
                status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
                error = null,
                session = null,
            ),
        )
        repository.createFailure = AgentApiException(
            AgentApiError.Problem(status = 409, title = "Agent authentication required", detail = null),
        )
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        createSessionThroughRoute(repository)

        val state = viewModel.uiState.value
        assertTrue(state.isPendingNewSession)
        assertTrue(viewModel.uiState.value.agentAuth.showAuthPanel)
        assertFalse(state.composerEnabled)
        assertEquals(PENDING_SESSION_MESSAGE, state.composerBlockedMessage)
        assertNull(sessionOwner.target)
    }

    @Test
    fun pendingSessionIsCreatedOnceLoginSucceeds() = runTest(dispatcher) {
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
        val repository = ChatFakeUserRepository(
            agentAuth = harold.android.contracts.AgentAuth(
                agentId = "cursor",
                status = harold.android.contracts.AgentAuthStatus.NeedsAuth,
                error = null,
                session = inProgress,
            ),
            actionSession = inProgress.copy(
                status = harold.android.contracts.AuthSessionStatus.Succeeded,
                steps = emptyList(),
            ),
        )
        repository.createFailure = AgentApiException(
            AgentApiError.Problem(status = 409, title = "Agent authentication required", detail = null),
        )
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        createSessionThroughRoute(repository)
        assertTrue(viewModel.uiState.value.isPendingNewSession)

        repository.createFailure = null
        viewModel.onAuthConfirm("confirm-1")
        advanceUntilIdle()

        assertEquals(2, repository.createCalls.size)
        assertEquals("/tmp/harold", repository.createCalls.last().cwd)
        assertEquals("sess_new", viewModel.uiState.value.selectedSession?.sessionId)
        assertEquals("cursor" to "sess_new", sessionOwner.target)
        assertEquals("sess_new", sessionOwner.rememberedConfigs.single().second)
    }

    @Test
    fun composerSendPromptsTheNewlyCreatedSession() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
        )

        advanceUntilIdle()
        createSessionThroughRoute(repository)

        viewModel.onComposerTextChanged("Ship it")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()

        assertEquals(1, repository.createCalls.size)
        assertEquals("sess_new", viewModel.uiState.value.selectedSession?.sessionId)
        assertEquals("cursor" to "sess_new", sessionOwner.target)
        assertEquals(listOf("Ship it"), sessionOwner.prompts)
        assertTrue(viewModel.uiState.value.transcript.rows.first() is TranscriptUserRow)
    }

    @Test
    fun streamsTranscriptAndAllowsFollowUpPrompt() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
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
            repository = ChatFakeUserRepository(),
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
    fun deletingTheSelectedSessionFromTheListClearsChat() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
        val navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02")
        val viewModel = createViewModel(repository, navigation)

        advanceUntilIdle()
        val selected = viewModel.uiState.value.selectedSession!!
        val sessionsRoute = SessionsViewModel(
            sessionGateway = pairedGateway(),
            sessionRepository = TestSessionRepository(repository),
            sessionCommands = sessionCommands,
            navigator = Navigator(),
            sessionOwner = ChatFakeSessionOwner(),
            savedHaroldRepository = SavedHaroldRepository(FakeCredentialStore()),
        )
        advanceUntilIdle()
        sessionsRoute.delete(selected)
        advanceUntilIdle()

        assertEquals(null, viewModel.uiState.value.selectedSession)
        assertTrue(viewModel.uiState.value.sessions.none { row -> row.sessionId == "sess_02" })
        assertEquals("sess_02", repository.deleteCalls.single().second)
        assertEquals(null, navigation.savedSessionId)
    }

    @Test
    fun reconnectClearsTranscriptBeforeReplay() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
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
            repository = ChatFakeUserRepository(),
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
    fun permissionForAnotherSessionMarksTheRowAndDoesNotCoverTheOpenChat() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val alerts = mutableListOf<harold.android.foreground.PermissionNotification>()
        val cleared = mutableListOf<String>()
        val notifier = object : harold.android.foreground.PermissionAttentionNotifier {
            override fun show(alert: harold.android.foreground.PermissionNotification) {
                alerts += alert
            }

            override fun clear(sessionId: String) {
                cleared += sessionId
            }
        }
        val marks = harold.android.foreground.DefaultSessionAttentionMarks()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
            sessionAttention = marks,
            permissionNotifier = notifier,
        )
        advanceUntilIdle()
        val open = listedSession("sess_02", "Alpha").copy(
            haroldName = "laptop",
            haroldIconId = "bolt",
        )
        viewModel.selectSession(open)
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
                    options = listOf(PermissionOption(optionId = "allow-once", name = "Allow once")),
                    createdAt = "",
                ),
            ),
        )
        advanceUntilIdle()
        assertEquals("fake-tool", viewModel.uiState.value.activePermissionRequest?.toolName)
        assertTrue(alerts.isEmpty())

        viewModel.selectSession(listedSession("sess_01", "Beta"))
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.activePermissionRequest)
        assertTrue(viewModel.uiState.value.sessions.single { row -> row.sessionId == "sess_02" }.needsAttention)
        assertEquals("Alpha · Needs permission", alerts.single().text)
        assertFalse(alerts.single().text.contains("laptop"))
        assertEquals("bolt", alerts.single().largeIconId)
        assertEquals("Harold", alerts.single().title)

        viewModel.selectSession(open)
        advanceUntilIdle()

        assertEquals("fake-tool", viewModel.uiState.value.activePermissionRequest?.toolName)
        assertEquals(listOf(open.id), cleared)
        assertFalse(viewModel.uiState.value.sessions.single { row -> row.sessionId == "sess_02" }.needsAttention)
    }

    @Test
    fun liveSnapshotMapsComposerConfig() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
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
            repository = ChatFakeUserRepository(),
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
    fun modelPickUsesTheSelectedSessionsHaroldOrigin() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val configApi = RecordingSessionConfigApi()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(),
            sessionOwner = sessionOwner,
            configApi = configApi,
        )
        advanceUntilIdle()

        val remoteOrigin = "http://desktop.local:3847"
        viewModel.selectSession(
            listedSession("sess_remote", "Remote").copy(
                serverOrigin = remoteOrigin,
                haroldName = "desktop",
                haroldColorId = "ink",
                haroldIconId = "mark",
            ),
        )
        advanceUntilIdle()
        sessionOwner.publish(
            sessionOwner.snapshot.value.copy(
                agentId = "cursor",
                sessionId = "sess_remote",
                configOptions = listOf(modelOption(currentValue = "m1")),
            ),
        )
        advanceUntilIdle()

        viewModel.onModelPick("m2")
        advanceUntilIdle()

        assertEquals(remoteOrigin, configApi.calls.single().serverOrigin)
    }

    @Test
    fun configEchoSettlesTheOptimisticPick() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
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
    fun switchingSessionsWithTheSameConfigKeepsComposerControls() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
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

        viewModel.selectSession(listedSession("sess_01", "Beta"))
        advanceUntilIdle()

        val model = viewModel.uiState.value.composerConfig.model
        assertNotNull(model)
        assertEquals("m1", (model as SelectOption).currentValue)
    }

    @Test
    fun reselectingTheCurrentSessionKeepsComposerControls() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
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
        val current = viewModel.uiState.value.sessions.first { row -> row.sessionId == "sess_02" }

        viewModel.selectSession(current)
        advanceUntilIdle()

        val model = viewModel.uiState.value.composerConfig.model
        assertNotNull(model)
        assertEquals("m1", (model as SelectOption).currentValue)
    }

    @Test
    fun modeCycleUsesTheReservedOptionId() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val configApi = RecordingSessionConfigApi()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
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
        val repository = ChatFakeUserRepository(
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
    fun hydratesAgentAuthWhenSelectingSession() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository(
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
            viewModel.uiState.value.agentAuth.agentAuth?.status,
        )
        assertEquals(listOf("cursor"), repository.authGetCalls)
    }

    @Test
    fun appliesAuthSessionUpdatedForMatchingAgent() = runTest(dispatcher) {
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
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

        assertTrue(viewModel.uiState.value.agentAuth.showAuthPanel)
        assertEquals("auth-1", viewModel.uiState.value.agentAuth.agentAuth?.session?.sessionId)
    }

    @Test
    fun authSignInStartsSession() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository(
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

        assertTrue(viewModel.uiState.value.agentAuth.showAuthPanel)
        viewModel.onAuthSignIn()
        advanceUntilIdle()

        assertEquals(1, repository.authStartCalls.size)
        assertEquals("auth-1", viewModel.uiState.value.agentAuth.agentAuth?.session?.sessionId)
        assertTrue(viewModel.uiState.value.agentAuth.showAuthPanel)
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
        val repository = ChatFakeUserRepository(
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
        val repository = ChatFakeUserRepository(
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

        assertTrue(viewModel.uiState.value.agentAuth.authSummary?.canLogout == true)
        viewModel.onAuthLogout()
        advanceUntilIdle()

        assertEquals(listOf("cursor"), repository.authLogoutCalls)
        assertEquals(
            harold.android.contracts.AgentAuthStatus.NeedsAuth,
            viewModel.uiState.value.agentAuth.summary?.status,
        )
        assertTrue(viewModel.uiState.value.agentAuth.showAuthPanel)
    }

    @Test
    fun disconnectFromServerRevokesDeviceAndClearsLocalAccess() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
        val sessionGateway = FakeSessionGateway(
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
    fun disconnectFromServerKeepsTheOtherHarold() = runTest(dispatcher) {
        val desktopOrigin = "http://desktop.local:3847"
        val store = FakeCredentialStore()
        store.save(savedHarold(ORIGIN, "device_01", "devcred_loop", "loopback"))
        store.save(savedHarold(desktopOrigin, "device_desktop", "devcred_desk", "desktop"))
        val repository = ChatFakeUserRepository()
        val sessionGateway = FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel"))
        sessionGateway.pairedAfterRefresh = PairedState.Paired(desktopOrigin, "device_desktop", "Pixel")
        val sessionOwner = ChatFakeSessionOwner()
        val navigator = Navigator()
        navigator.start(paired = true)
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
            sessionGateway = sessionGateway,
            savedHaroldRepository = SavedHaroldRepository(store),
            navigator = navigator,
        )
        advanceUntilIdle()

        viewModel.disconnectFromServer()
        advanceUntilIdle()

        assertEquals(listOf(desktopOrigin), store.list().map { harold -> harold.serverOrigin })
        assertEquals(desktopOrigin, sessionOwner.connections.last())
        assertEquals(listOf(harold.android.navigation.Chat), navigator.backStack.toList())
        assertEquals(0, sessionGateway.clearLocalAccessCount)
    }

    @Test
    fun authRequiredStreamErrorHydratesAuth() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository(
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
        assertEquals("auth-req", viewModel.uiState.value.agentAuth.agentAuth?.session?.sessionId)
        assertTrue(viewModel.uiState.value.agentAuth.showAuthPanel)
    }

    @Test
    fun commandsUpdatePopulatesStateWithoutTouchingTranscriptAndRestoresOnSwitchBack() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
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
        val repository = ChatFakeUserRepository()
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

    @Test
    fun changesBadgeLoadsForTheSelectedSession() = runTest(dispatcher) {
        val gitApi = RecordingGitApi()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            gitApi = gitApi,
        )

        advanceUntilIdle()

        assertEquals(1, gitApi.summaryCalls.size)
        assertEquals("sess_02", viewModel.uiState.value.selectedSession?.sessionId)
        assertTrue(viewModel.uiState.value.changesAvailable)
        assertEquals(3, viewModel.uiState.value.changesBadgeCount)
    }

    @Test
    fun changesBadgeHidesWhenTheSummaryFails() = runTest(dispatcher) {
        val gitApi = RecordingGitApi(
            summaryResult = Result.failure(
                AgentApiException(
                    AgentApiError.Problem(404, "Not a git repository", "Not a git repository"),
                ),
            ),
        )
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            gitApi = gitApi,
        )

        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.changesAvailable)
        assertEquals(0, viewModel.uiState.value.changesBadgeCount)
    }

    @Test
    fun changesBadgeRefreshesWhenATurnFinishes() = runTest(dispatcher) {
        val gitApi = RecordingGitApi()
        val sessionOwner = ChatFakeSessionOwner()
        val viewModel = createViewModel(
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            sessionOwner = sessionOwner,
            gitApi = gitApi,
        )
        advanceUntilIdle()
        assertEquals(1, gitApi.summaryCalls.size)

        sessionOwner.publish(
            SessionSnapshot(
                agentId = "cursor",
                sessionId = "sess_02",
                transcript = harold.android.live.AcpTranscriptState(
                    sessionState = SessionState.Running,
                    live = true,
                ),
            ),
        )
        advanceUntilIdle()
        assertEquals(1, gitApi.summaryCalls.size)

        sessionOwner.publish(
            SessionSnapshot(
                agentId = "cursor",
                sessionId = "sess_02",
                transcript = harold.android.live.AcpTranscriptState(
                    sessionState = SessionState.Idle,
                    live = true,
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals(2, gitApi.summaryCalls.size)
        assertEquals(3, viewModel.uiState.value.changesBadgeCount)
    }

    private fun createViewModel(
        repository: ChatFakeUserRepository,
        navigation: ChatFakeNavigationPreferences,
        sessionOwner: ChatFakeSessionOwner = ChatFakeSessionOwner(),
        sessionGateway: FakeSessionGateway = pairedGateway(),
        sessionRepository: SessionRepository = TestSessionRepository(repository),
        configApi: SessionConfigApi = RecordingSessionConfigApi(),
        attachmentApi: AttachmentApi = NoopAttachmentApi(),
        gitApi: GitApi = RecordingGitApi(),
        savedHaroldRepository: SavedHaroldRepository = SavedHaroldRepository(FakeCredentialStore()),
        navigator: Navigator = Navigator(),
        haroldConnections: harold.android.session.HaroldConnections? = null,
        sessionAttention: harold.android.foreground.SessionAttentionMarks? = null,
        permissionNotifier: harold.android.foreground.PermissionAttentionNotifier? = null,
    ): ChatViewModel = ChatViewModel(
        savedStateHandle = SavedStateHandle(),
        sessionGateway = sessionGateway,
        sessionOwner = sessionOwner,
        sessionRepository = sessionRepository,
        userRepository = repository,
        savedHaroldRepository = savedHaroldRepository,
        attachmentApi = attachmentApi,
        configApi = configApi,
        gitApi = gitApi,
        navigationPreferences = navigation,
        voiceDictationController = VoiceDictationController(
            speechClient = FakeSpeechRecognitionClient(),
            silenceScheduler = ImmediateVoiceDictationRestartScheduler(),
            restartScheduler = ImmediateVoiceDictationRestartScheduler(),
        ),
        previewDispatcher = dispatcher,
        navigator = navigator,
        sessionCommands = sessionCommands,
        haroldConnections = haroldConnections,
        sessionAttention = sessionAttention,
        permissionNotifier = permissionNotifier,
    )

    private fun pairedGateway(): FakeSessionGateway =
        FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel"))

    private fun TestScope.createSessionThroughRoute(repository: ChatFakeUserRepository) {
        val route = CreateSessionViewModel(
            sessionGateway = pairedGateway(),
            sessionRepository = TestSessionRepository(repository),
            workspaceRepository = TestWorkspaceRepository(repository),
            userRepository = repository,
            sessionCommands = sessionCommands,
            navigator = Navigator(),
        )
        advanceUntilIdle()
        route.onWorkspaceChanged("ws_01")
        route.onAgentChanged("cursor")
        route.submit()
        advanceUntilIdle()
    }

    @Test
    fun attachmentUploadsToTheSelectedSessionWithoutNamingAWorkspace() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository(
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
            repository = ChatFakeUserRepository(),
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
    fun attachingInANewSessionUploadsEveryFileWithoutASecondCreate() = runTest(dispatcher) {
        val repository = ChatFakeUserRepository()
        val attachments = RecordingAttachmentApi()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(),
            attachmentApi = attachments,
        )
        advanceUntilIdle()
        createSessionThroughRoute(repository)
        assertEquals("sess_new", viewModel.uiState.value.selectedSession?.sessionId)
        assertEquals(1, repository.createCalls.size)

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
    fun attachmentFailsWithTheServerReasonWhenTheSessionFolderIsUnavailable() = runTest(dispatcher) {
        val attachments = object : AttachmentApi {
            override suspend fun uploadAttachment(
                serverOrigin: String,
                request: AttachmentUploadRequest,
            ): Result<AttachmentDescriptor> = Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 404,
                        title = "Session not found",
                        detail = "The session folder is unavailable",
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
            repository = ChatFakeUserRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            attachmentApi = attachments,
        )
        advanceUntilIdle()

        viewModel.onAttachmentsPicked(listOf(AttachmentPick("notes.txt", "text/plain", byteArrayOf(1))))
        advanceUntilIdle()

        val pending = viewModel.uiState.value.pendingAttachments.single()
        assertEquals(AttachmentUploadStatus.Failed, pending.status)
        assertEquals("The session folder is unavailable", pending.error)
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

private class RecordingGitApi(
    private val summaryResult: Result<GitSummary> = Result.success(
        GitSummary(
            repository = GitRepository(
                root = "/tmp/harold",
                currentWorktreePath = "/tmp/harold",
                currentBranch = "main",
                defaultBranch = "main",
                headSha = "abc123",
            ),
            uncommittedFileCount = 3,
        ),
    ),
) : GitApi {
    val summaryCalls = mutableListOf<Pair<String, String>>()

    override suspend fun getSummary(
        serverOrigin: String,
        path: String,
    ): Result<GitSummary> {
        summaryCalls += serverOrigin to path
        return summaryResult
    }

    override suspend fun listWorktrees(
        serverOrigin: String,
        path: String,
    ): Result<GitWorktreeCollection> =
        Result.failure(UnsupportedOperationException("not used"))

    override suspend fun getChanges(
        serverOrigin: String,
        path: String,
        scope: GitScope,
    ): Result<GitChanges> =
        Result.failure(UnsupportedOperationException("not used"))

    override suspend fun getFileDiff(
        serverOrigin: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String?,
    ): Result<GitFileDiff> =
        Result.failure(UnsupportedOperationException("not used"))
}

private class ChatFakeSessionOwner : SessionOwner {
    private val _connectionState = MutableStateFlow(ConnectionState())
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _snapshot = MutableStateFlow(SessionSnapshot())
    override val snapshot: StateFlow<SessionSnapshot> = _snapshot.asStateFlow()

    private val _sessionTitles = MutableStateFlow<Map<String, String>>(emptyMap())
    override val sessionTitles: StateFlow<Map<String, String>> = _sessionTitles.asStateFlow()

    private val _promptCompletions = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    override val promptCompletions: Flow<Unit> = _promptCompletions.asSharedFlow()

    val prompts = mutableListOf<String>()
    val permissionReplies = mutableListOf<Pair<String, String>>()
    val rememberedConfigs = mutableListOf<Triple<AgentId, String, List<ConfigOption>>>()
    var cancels = 0
        private set
    var disconnects = 0
        private set
    var target: Pair<String, String>? = null
        private set
    var foregroundProbes = 0
        private set
    var backgroundMarks = 0
        private set

    fun publish(snapshot: SessionSnapshot) {
        _snapshot.value = snapshot
    }

    fun publishTitles(titles: Map<String, String>) {
        _sessionTitles.value = titles
    }

    fun completePrompt() {
        _promptCompletions.tryEmit(Unit)
    }

    val connections = mutableListOf<String>()

    override fun connect(serverOrigin: String) {
        connections += serverOrigin
    }
    override fun retry() = Unit

    override fun disconnect() {
        disconnects += 1
        target = null
        _snapshot.value = SessionSnapshot()
    }

    override fun onBackground() {
        backgroundMarks += 1
    }

    override fun onForeground() {
        foregroundProbes += 1
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

    override suspend fun prompt(
        text: String,
        attachments: List<AttachmentReference>,
    ): Result<Unit> {
        prompts += text
        val turnId = "turn-${prompts.size}"
        _snapshot.update { current ->
            current.copy(transcript = beginUserTurn(current.transcript, turnId, text))
        }
        return Result.success(Unit)
    }

    override suspend fun cancel(): Result<Unit> {
        cancels += 1
        return Result.success(Unit)
    }

    override suspend fun replyPermission(requestId: String, optionId: String): Result<Unit> {
        permissionReplies += requestId to optionId
        _snapshot.update { current -> current.copy(pendingPermission = null) }
        return Result.success(Unit)
    }

    override suspend fun replyExtension(requestId: String, result: JsonElement): Result<Unit> {
        _snapshot.update { current -> current.copy(extension = null) }
        return Result.success(Unit)
    }

    override fun rememberConfig(agentId: AgentId, sessionId: String, configOptions: List<ConfigOption>) {
        rememberedConfigs += Triple(agentId, sessionId, configOptions)
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

private class ChatFakeUserRepository(
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
    var sessionsGate: CompletableDeferred<Unit>? = null,
) : UserRepository {
    val createCalls = mutableListOf<CreateSessionBody>()
    val deleteCalls = mutableListOf<Pair<String, String>>()
    val authGetCalls = mutableListOf<String>()
    val authStartCalls = mutableListOf<String>()
    val authActionCalls = mutableListOf<Triple<String, String, harold.android.contracts.AuthSessionAction>>()
    val authLogoutCalls = mutableListOf<String>()
    val revokeDeviceCalls = mutableListOf<String>()
    var agentAuthOverride: harold.android.contracts.AgentAuth = agentAuth
    var createFailure: Throwable? = null
    var sessionsOverride: List<Session>? = null
    var sessionsByOrigin: Map<String, List<Session>>? = null
    var failOrigins: Set<String> = emptySet()
    var listSessionsCalls = 0
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
        root: String?,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCollection>(
        UnsupportedOperationException(),
    )

    override suspend fun createFilesystemDirectory(
        serverOrigin: String,
        body: harold.android.contracts.CreateFilesystemDirectoryBody,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCreated>(
        UnsupportedOperationException("unused"),
    )

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: harold.android.contracts.CreateWorkspaceBody,
    ) = Result.failure<Workspace>(UnsupportedOperationException())

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<SessionCollection> {
        listSessionsCalls += 1
        sessionsGate?.await()
        if (serverOrigin in failOrigins) {
            return Result.failure(IllegalStateException("offline"))
        }
        sessionsByOrigin?.get(serverOrigin)?.let { sessions ->
            return Result.success(SessionCollection(items = sessions))
        }
        return Result.success(
            SessionCollection(items = sessionsOverride ?: (createdSessions + seed)),
        )
    }

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
        createFailure?.let { error -> return Result.failure(error) }
        val created = session("sess_new", "New session", updatedAt = "2026-08-05T03:00:00.000Z")
        createdSessions += created
        return Result.success(
            CreateSessionResponse(
                agentId = created.agentId,
                sessionId = created.sessionId,
                cwd = created.cwd,
                title = created.title,
                updatedAt = created.updatedAt,
                configOptions = listOf(
                    JsonObject(
                        mapOf(
                            "id" to JsonPrimitive("model"),
                            "name" to JsonPrimitive("Model"),
                            "category" to JsonPrimitive("model"),
                            "type" to JsonPrimitive("select"),
                            "currentValue" to JsonPrimitive("m1"),
                            "options" to JsonArray(
                                listOf(
                                    JsonObject(
                                        mapOf(
                                            "value" to JsonPrimitive("m1"),
                                            "name" to JsonPrimitive("M1"),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        )
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

private fun savedHarold(
    serverOrigin: String,
    deviceId: String,
    credential: String,
    name: String,
) = StoredCredential(
    formatVersion = 1,
    deviceId = deviceId,
    serverOrigin = serverOrigin,
    deviceName = "Pixel",
    credential = credential,
    name = name,
    colorId = "ink",
    iconId = "mark",
)

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

private fun listedSession(id: String, title: String) = SessionRow(
    sessionId = id,
    name = title,
    cwd = "/tmp/harold",
    workspaceId = "ws_01",
    workspaceLabel = "harold",
    agentId = "cursor",
    agentLabel = "Cursor",
    state = SessionState.Idle,
    updatedAt = "2026-08-05T01:00:00.000Z",
)

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

private class RecordingHaroldConnections(
    private val reported: MutableList<Pair<String, List<harold.android.contracts.SessionState>>>,
) : harold.android.session.HaroldConnections {
    override val connections = MutableStateFlow(emptyList<harold.android.session.HaroldConnection>())

    override fun onForeground() = Unit

    override fun onBackground() = Unit

    override suspend fun refresh() = Unit

    override fun setSessionStates(
        serverOrigin: String,
        states: List<harold.android.contracts.SessionState>,
    ) {
        reported += serverOrigin to states
    }

    override fun shouldStayConnected(serverOrigin: String): Boolean = false
}
