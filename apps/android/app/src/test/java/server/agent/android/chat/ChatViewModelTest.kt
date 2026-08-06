package server.agent.android.chat

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
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
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.ItemCollection
import server.agent.android.contracts.PageInfo
import server.agent.android.contracts.PromptSessionBody
import server.agent.android.contracts.PromptSessionResponse
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.UpdateSessionBody
import server.agent.android.contracts.PermissionOption
import server.agent.android.contracts.PermissionOptionKind
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.PermissionStatus
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection
import server.agent.android.contracts.WorkspaceState
import server.agent.android.events.ConnectionState
import server.agent.android.events.EventStreamFactory
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
        val viewModel = createViewModel(repository, navigation)

        advanceUntilIdle()

        assertEquals("Selected", viewModel.uiState.value.selectedSession?.name)
        assertEquals(2, viewModel.uiState.value.sessions.size)
        assertEquals(listOf("sess_02"), repository.selectCalls)
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
    fun createSessionSubmitsWhenValid() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val viewModel = createViewModel(repository, ChatFakeNavigationPreferences())

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

    @Test
    fun streamsTranscriptAndAllowsFollowUpPrompt() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val eventSource = FakeSessionEventSource()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            eventSource = eventSource,
        )

        advanceUntilIdle()

        eventSource.emit(
            listOf(
                turnStarted(cursor = "1", text = "Explain auth", sessionId = "sess_02"),
                thoughtDelta(cursor = "2", text = "plan", sessionId = "sess_02"),
                outputDelta(cursor = "3", text = "done", sessionId = "sess_02"),
                sessionState(cursor = "4", state = SessionState.Idle, sessionId = "sess_02"),
            ),
        )
        advanceUntilIdle()

        val transcript = viewModel.uiState.value.transcript
        assertEquals(3, transcript.rows.size)
        assertTrue(transcript.rows[0] is TranscriptUserRow)
        assertEquals(SessionState.Idle, viewModel.uiState.value.effectiveSessionState)
        assertTrue(viewModel.uiState.value.composerEnabled)

        viewModel.onComposerTextChanged("Follow up")
        viewModel.submitComposerPrompt()
        advanceUntilIdle()

        assertEquals(1, repository.promptCalls.size)
        assertEquals("Follow up", repository.promptCalls.first().text)
        assertEquals("", viewModel.uiState.value.composerText)
    }

    @Test
    fun blocksComposerWhileSessionRunning() = runTest(dispatcher) {
        val eventSource = FakeSessionEventSource()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            eventSource = eventSource,
        )

        advanceUntilIdle()

        eventSource.emit(
            listOf(
                turnStarted(cursor = "1", sessionId = "sess_02"),
                sessionState(cursor = "2", state = SessionState.Running, sessionId = "sess_02"),
            ),
        )
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.composerEnabled)
        assertTrue(viewModel.uiState.value.showProgress)
    }

    @Test
    fun reconnectClearsTranscriptBeforeReplay() = runTest(dispatcher) {
        val eventSource = FakeSessionEventSource()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            eventSource = eventSource,
        )

        advanceUntilIdle()

        eventSource.emit(listOf(turnStarted(cursor = "1", text = "first", sessionId = "sess_02")))
        advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.transcript.rows.size)

        eventSource.triggerReconnect()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.streamReconnecting)
        assertEquals(0, viewModel.uiState.value.transcript.rows.size)

        eventSource.emit(
            listOf(
                turnStarted(cursor = "1", text = "first", sessionId = "sess_02"),
                outputDelta(cursor = "2", text = "reply", sessionId = "sess_02"),
                sessionState(cursor = "3", state = SessionState.Idle, sessionId = "sess_02"),
            ),
        )
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.streamReconnecting)
        assertEquals(2, viewModel.uiState.value.transcript.rows.size)
    }

    @Test
    fun cancelSessionCallsRepository() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val eventSource = FakeSessionEventSource()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            eventSource = eventSource,
        )

        advanceUntilIdle()
        eventSource.emit(
            listOf(sessionState(cursor = "1", state = SessionState.Running, sessionId = "sess_02")),
        )
        advanceUntilIdle()
        viewModel.submitCancel()
        advanceUntilIdle()

        assertEquals(listOf("sess_02"), repository.cancelCalls)
    }

    @Test
    fun renameSessionUpdatesListAndHeader() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
        )

        advanceUntilIdle()
        viewModel.showRenameDialog()
        viewModel.onRenameNameChanged("Renamed session")
        viewModel.submitRename()
        advanceUntilIdle()

        assertEquals("Renamed session", viewModel.uiState.value.selectedSession?.name)
        assertEquals(
            "Renamed session",
            viewModel.uiState.value.sessions.first { it.id == "sess_02" }.name,
        )
    }

    @Test
    fun archiveSessionClearsSelection() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02")
        val viewModel = createViewModel(repository, navigation)

        advanceUntilIdle()
        viewModel.submitArchive()
        advanceUntilIdle()

        assertEquals(null, viewModel.uiState.value.selectedSession)
        assertTrue(viewModel.uiState.value.sessions.none { it.id == "sess_02" })
        assertEquals(null, navigation.savedSessionId)
    }

    @Test
    fun sessionStateEventUpdatesListRow() = runTest(dispatcher) {
        val eventSource = FakeSessionEventSource()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            eventSource = eventSource,
        )

        advanceUntilIdle()

        eventSource.emit(
            listOf(sessionState(cursor = "1", state = SessionState.Stopping, sessionId = "sess_02")),
        )
        advanceUntilIdle()

        assertEquals(SessionState.Stopping, viewModel.uiState.value.sessions.first { it.id == "sess_02" }.state)
        assertEquals(SessionState.Stopping, viewModel.uiState.value.effectiveSessionState)
    }

    @Test
    fun loadsPendingPermissionsAfterSessionSelect() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
        )

        advanceUntilIdle()

        assertEquals(1, repository.pendingCalls.size)
        assertEquals("perm_01", viewModel.uiState.value.activePermissionRequest?.id)
    }

    @Test
    fun permissionEventsUpdatePendingState() = runTest(dispatcher) {
        val eventSource = FakeSessionEventSource()
        val viewModel = createViewModel(
            repository = ChatFakeOperatorRepository(),
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            eventSource = eventSource,
        )

        advanceUntilIdle()

        eventSource.emit(listOf(permissionRequested(cursor = "1", sessionId = "sess_02")))
        advanceUntilIdle()

        assertEquals("fake-tool", viewModel.uiState.value.activePermissionRequest?.toolName)
        assertEquals(2, viewModel.uiState.value.activePermissionRequest?.options?.size)
    }

    @Test
    fun resolvePermissionClearsSubmittingState() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository()
        val eventSource = FakeSessionEventSource()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            eventSource = eventSource,
        )

        advanceUntilIdle()
        eventSource.emit(listOf(permissionRequested(cursor = "1", sessionId = "sess_02")))
        advanceUntilIdle()

        viewModel.submitPermissionOption("allow-once")
        advanceUntilIdle()

        assertEquals(1, repository.resolveCalls.size)
        assertEquals(null, viewModel.uiState.value.permissionUiState.submittingOptionId)
    }

    @Test
    fun resolvePermissionConflictRefreshesPendingAndShowsError() = runTest(dispatcher) {
        val repository = ChatFakeOperatorRepository(resolveConflict = true)
        val eventSource = FakeSessionEventSource()
        val viewModel = createViewModel(
            repository = repository,
            navigation = ChatFakeNavigationPreferences(lastSessionId = "sess_02"),
            eventSource = eventSource,
        )

        advanceUntilIdle()
        eventSource.emit(listOf(permissionRequested(cursor = "1", sessionId = "sess_02")))
        advanceUntilIdle()

        viewModel.submitPermissionOption("allow-once")
        advanceUntilIdle()

        assertEquals(2, repository.pendingCalls.size)
        assertEquals(null, viewModel.uiState.value.activePermissionRequest)
        assertTrue(viewModel.uiState.value.permissionUiState.error?.isNotBlank() == true)
    }

    private fun createViewModel(
        repository: ChatFakeOperatorRepository,
        navigation: ChatFakeNavigationPreferences,
        eventSource: FakeSessionEventSource = FakeSessionEventSource(),
    ): ChatViewModel = ChatViewModel(
        savedStateHandle = SavedStateHandle(),
        sessionGateway = ChatFakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
        connectionGateway = ChatFakeConnectionGateway(),
        operatorRepository = repository,
        navigationPreferences = navigation,
        eventStreamFactory = EventStreamFactory { _ -> error("unused in tests") },
        sessionEventSource = eventSource,
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

    override suspend fun clearLastSessionId() {
        savedSessionId = null
    }
}

private class FakeSessionEventSource : SessionEventSource {
    private var onEvents: ((List<EventEnvelope>) -> Unit)? = null
    private var onReconnect: (() -> Unit)? = null

    override fun observe(
        serverOrigin: String,
        sessionId: String,
        onReconnect: () -> Unit,
        onEvents: (List<EventEnvelope>) -> Unit,
    ): Job {
        this.onReconnect = onReconnect
        this.onEvents = onEvents
        return Job()
    }

    fun emit(events: List<EventEnvelope>) {
        onEvents?.invoke(events)
    }

    fun triggerReconnect() {
        onReconnect?.invoke()
    }
}

private class ChatFakeOperatorRepository(
    private val resolveConflict: Boolean = false,
) : OperatorRepository {
    val selectCalls = mutableListOf<String>()
    val createCalls = mutableListOf<CreateSessionBody>()
    val promptCalls = mutableListOf<PromptSessionBody>()
    val cancelCalls = mutableListOf<String>()
    val updateCalls = mutableListOf<UpdateSessionBody>()
    val archiveCalls = mutableListOf<String>()
    val pendingCalls = mutableListOf<String>()
    val resolveCalls = mutableListOf<Pair<String, String>>()
    private val createdSessions = mutableListOf<Session>()

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

    override suspend fun listSessions(
        serverOrigin: String,
        workspaceId: String?,
        limit: Int,
    ) = Result.success(
        ItemCollection(
            items = createdSessions + listOf(
                session("sess_02", "Alpha"),
                session("sess_01", "Beta"),
            ),
            page = PageInfo(limit = 100, count = 2 + createdSessions.size),
        ),
    )

    override suspend fun listAgents(serverOrigin: String) = Result.success(
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

    override suspend fun promptSession(
        serverOrigin: String,
        sessionId: String,
        body: PromptSessionBody,
    ): Result<PromptSessionResponse> {
        promptCalls += body
        return Result.success(PromptSessionResponse(turnId = "turn_follow_up"))
    }

    override suspend fun updateSession(
        serverOrigin: String,
        sessionId: String,
        body: UpdateSessionBody,
    ): Result<Session> {
        updateCalls += body
        return Result.success(session(sessionId, body.name))
    }

    override suspend fun cancelSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<server.agent.android.contracts.CancelSessionResponse> {
        cancelCalls += sessionId
        return Result.success(server.agent.android.contracts.CancelSessionResponse(turnId = "turn_cancel"))
    }

    override suspend fun archiveSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session> {
        archiveCalls += sessionId
        return Result.success(
            session(sessionId, "Archived").copy(
                state = SessionState.Archived,
                archivedAt = "2026-08-06T00:00:00.000Z",
            ),
        )
    }

    override suspend fun listPendingPermissions(
        serverOrigin: String,
        sessionId: String,
    ): Result<List<PermissionRequest>> {
        pendingCalls += sessionId
        return if (resolveConflict && pendingCalls.size > 1) {
            Result.success(emptyList())
        } else {
            Result.success(listOf(samplePermission(sessionId)))
        }
    }

    override suspend fun resolvePermission(
        serverOrigin: String,
        sessionId: String,
        requestId: String,
        optionId: String,
    ): Result<PermissionRequest> {
        resolveCalls += requestId to optionId
        return if (resolveConflict) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 409,
                        title = "Conflict",
                        detail = "permission request already resolved",
                    ),
                ),
            )
        } else {
            Result.success(samplePermission(sessionId).copy(status = PermissionStatus.Resolved))
        }
    }

    private fun samplePermission(sessionId: String): PermissionRequest = PermissionRequest(
        id = "perm_01",
        sessionId = sessionId,
        turnId = "turn_01",
        toolCallId = "tool_01",
        toolName = "fake-tool",
        status = PermissionStatus.Pending,
        options = listOf(
            PermissionOption("allow-once", "Allow once", PermissionOptionKind.Allow),
            PermissionOption("reject-once", "Reject once", PermissionOptionKind.Deny),
        ),
        createdAt = "2026-08-06T00:00:00.000Z",
    )

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
