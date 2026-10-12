package harold.android.chat

import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentSettings
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import harold.android.navigation.Chat
import harold.android.session.PairedState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
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

    private fun viewModel(
        commands: RecordingSessionCommands = RecordingSessionCommands(),
        navigator: harold.android.navigation.Navigator = testNavigator(),
        repository: RouteUserRepository = repository(),
    ): CreateSessionViewModel = CreateSessionViewModel(
        sessionGateway = FixedSessionGateway(PAIRED),
        userRepository = repository,
        sessionCommands = commands,
        navigator = navigator,
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

    private fun workspace(id: String, state: WorkspaceState) = Workspace(
        id = id,
        name = id,
        path = "/tmp/harold",
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
    }
}
