package harold.android.chat

import harold.android.contracts.AgentSettings
import harold.android.contracts.Session
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import harold.android.navigation.Chat
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.PairedState
import harold.android.testing.FakeSessionGateway
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    private fun viewModel(
        sessions: List<Session> = listOf(session("sess_01", "Alpha", "2026-08-03T00:00:00.000Z")),
        commands: RecordingSessionCommands = RecordingSessionCommands(),
        navigator: harold.android.navigation.Navigator = testNavigator(),
        repository: RouteUserRepository = repository(sessions),
    ): SessionsViewModel = SessionsViewModel(
        sessionGateway = FakeSessionGateway(PAIRED),
        userRepository = repository,
        sessionCommands = commands,
        navigator = navigator,
    )

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
    }
}
