package harold.android.connections

import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AgentRuntimeState
import harold.android.contracts.AgentRuntimeStatus
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.UpdateAgentBody
import harold.android.navigation.Navigator
import harold.android.user.UserRepository
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
class AgentsViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun togglingAgentKeepsItInPlaceWithoutMovingToBottom() = runTest {
        val fakeRepo = FakeAgentsUserRepository(
            agents = listOf(
                agent(id = "alpha", name = "Alpha", enabled = true),
                agent(id = "beta", name = "Beta", enabled = false),
                agent(id = "gamma", name = "Gamma", enabled = false),
            ),
        )
        val viewModel = AgentsViewModel(fakeRepo, Navigator())
        viewModel.start("ssh://gary@laptop:22")

        assertEquals(
            listOf("alpha", "beta", "gamma"),
            viewModel.uiState.value.rows.map { it.id },
        )

        // Toggle Beta to enabled
        viewModel.toggleEnabled("beta", true)

        // Beta must remain at index 1, NOT moved to the bottom!
        assertEquals(
            listOf("alpha", "beta", "gamma"),
            viewModel.uiState.value.rows.map { it.id },
        )
        assertTrue(viewModel.uiState.value.rows[1].enabled)
    }

    @Test
    fun applyAgentsSortsEnabledThenPopularThenPresentThenName() = runTest {
        val fakeRepo = FakeAgentsUserRepository(
            agents = listOf(
                agent(id = "z_present", name = "Zebra", enabled = false, popular = false, present = true),
                agent(id = "a_enabled", name = "Aardvark", enabled = true, popular = false, present = true),
                agent(id = "m_popular", name = "Monkey", enabled = false, popular = true, present = false),
                agent(id = "b_enabled", name = "Bear", enabled = true, popular = false, present = false),
            ),
        )
        val viewModel = AgentsViewModel(fakeRepo, Navigator())
        viewModel.start("ssh://gary@laptop:22")

        val sortedIds = viewModel.uiState.value.rows.map { it.id }
        // Enabled first (Aardvark, Bear)
        // Then Popular (Monkey)
        // Then Present (Zebra)
        assertEquals(
            listOf("a_enabled", "b_enabled", "m_popular", "z_present"),
            sortedIds,
        )
    }

    @Test
    fun searchAndCategoryFiltering() = runTest {
        val fakeRepo = FakeAgentsUserRepository(
            agents = listOf(
                agent(id = "cursor", name = "Cursor", enabled = true, popular = true),
                agent(id = "claude", name = "Claude Agent", enabled = false, popular = true),
                agent(id = "custom_one", name = "My Tool", enabled = true, popular = false),
            ),
        )
        val viewModel = AgentsViewModel(fakeRepo, Navigator())
        viewModel.start("ssh://gary@laptop:22")

        assertEquals(3, viewModel.uiState.value.totalCount)
        assertEquals(2, viewModel.uiState.value.enabledCount)
        assertEquals(2, viewModel.uiState.value.popularCount)

        viewModel.onSearchQueryChanged("claude")
        assertEquals("claude", viewModel.uiState.value.searchQuery)

        viewModel.onCategorySelected(AgentCategory.Enabled)
        assertEquals(AgentCategory.Enabled, viewModel.uiState.value.selectedCategory)
    }

    @Test
    fun customAgentCreationAppendsAgent() = runTest {
        val fakeRepo = FakeAgentsUserRepository(
            agents = listOf(
                agent(id = "cursor", name = "Cursor", enabled = true),
            ),
        )
        val viewModel = AgentsViewModel(fakeRepo, Navigator())
        viewModel.start("ssh://gary@laptop:22")

        viewModel.startCreateCustom()
        viewModel.onCreateNameChanged("My Custom Bot")
        viewModel.onCreatePathChanged("/usr/local/bin/mybot")
        viewModel.onCreateArgsChanged("--flag")
        viewModel.createCustom()

        assertFalse(viewModel.uiState.value.showCreateCustom)
        assertTrue(viewModel.uiState.value.rows.any { it.displayName == "My Custom Bot" })
    }

    private fun agent(
        id: String,
        name: String,
        enabled: Boolean = false,
        popular: Boolean = false,
        present: Boolean = true,
        dismissed: Boolean = false,
    ): AgentSettings = AgentSettings(
        id = id,
        displayName = name,
        available = true,
        enabled = enabled,
        path = "/bin/$id",
        present = present,
        popular = popular,
        deletable = false,
        dismissed = dismissed,
        state = AgentRuntimeState(AgentRuntimeStatus.Stopped),
        authSummary = AgentAuthSummary(
            status = AgentAuthStatus.Authenticated,
            error = null,
            activeSessionId = null,
            canLogout = false,
        ),
    )
}

private class FakeAgentsUserRepository(
    agents: List<AgentSettings> = emptyList(),
) : UserRepository {
    private val agentList = agents.toMutableList()

    override suspend fun listAgents(connectionId: String): Result<AgentSettingsCollection> =
        Result.success(AgentSettingsCollection(agentList))

    override suspend fun scanAgents(connectionId: String): Result<AgentSettingsCollection> =
        Result.success(AgentSettingsCollection(agentList))

    override suspend fun updateAgent(
        connectionId: String,
        agentId: AgentId,
        body: UpdateAgentBody,
    ): Result<AgentSettings> {
        val idx = agentList.indexOfFirst { it.id == agentId }
        if (idx < 0) return Result.failure(NoSuchElementException(agentId))
        val current = agentList[idx]
        val updated = current.copy(
            displayName = body.displayName ?: current.displayName,
            path = body.path ?: current.path,
            args = body.args ?: current.args,
            enabled = body.enabled ?: current.enabled,
            dismissed = body.dismissed ?: current.dismissed,
        )
        agentList[idx] = updated
        return Result.success(updated)
    }

    override suspend fun createCustomAgent(
        connectionId: String,
        body: CreateCustomAgentBody,
    ): Result<AgentSettings> {
        val created = AgentSettings(
            id = "custom_${agentList.size}",
            displayName = body.displayName,
            available = true,
            enabled = true,
            path = body.path,
            args = body.args,
            present = true,
            popular = false,
            deletable = true,
            dismissed = false,
            state = AgentRuntimeState(AgentRuntimeStatus.Stopped),
            authSummary = AgentAuthSummary(
                status = AgentAuthStatus.Unknown,
                error = null,
                activeSessionId = null,
                canLogout = false,
            ),
        )
        agentList.add(created)
        return Result.success(created)
    }

    override suspend fun deleteAgent(connectionId: String, agentId: AgentId): Result<Unit> {
        agentList.removeIf { it.id == agentId }
        return Result.success(Unit)
    }

    override suspend fun reloadConfig(connectionId: String): Result<AgentSettingsCollection> =
        Result.success(AgentSettingsCollection(agentList))

    override suspend fun restartAgent(connectionId: String, agentId: AgentId): Result<Unit> =
        Result.success(Unit)

    override suspend fun getAgentAuth(connectionId: String, agentId: AgentId) = error("unused")
    override suspend fun logoutAgentAuth(connectionId: String, agentId: AgentId) = error("unused")
    override suspend fun listWorkspaces(connectionId: String, limit: Int) = error("unused")
    override suspend fun listFilesystemDirectories(connectionId: String, root: String?) = error("unused")
    override suspend fun createFilesystemDirectory(connectionId: String, body: CreateFilesystemDirectoryBody) = error("unused")
    override suspend fun createWorkspace(connectionId: String, body: CreateWorkspaceBody) = error("unused")
    override suspend fun listSessions(connectionId: String, cwd: String?) = error("unused")
    override suspend fun createSession(connectionId: String, body: CreateSessionBody) = error("unused")
    override suspend fun deleteSession(connectionId: String, agentId: AgentId, sessionId: String) = error("unused")
}
