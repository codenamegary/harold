package harold.android.workspaces

import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.PairedState
import harold.android.testing.FakeSessionGateway
import harold.android.workspaces.data.CachedWorkspace
import harold.android.workspaces.data.WorkspaceRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkspacesViewModelTest {
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
    fun loadsWorkspaces() = runTest(dispatcher) {
        val viewModel = WorkspacesViewModel(
            sessionGateway = FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            workspaceRepository = FakeWorkspaceRepository(),
        )

        viewModel.refresh()
        advanceUntilIdle()

        val loaded = viewModel.uiState.value.loadState as WorkspacesLoadState.Loaded
        assertEquals(1, loaded.workspaces.size)
        assertEquals(WorkspaceState.Available, loaded.workspaces.single().state)
    }

    @Test
    fun reportsEmptyWorkspaces() = runTest(dispatcher) {
        val viewModel = WorkspacesViewModel(
            sessionGateway = FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            workspaceRepository = FakeWorkspaceRepository(workspaces = emptyList()),
        )

        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.loadState is WorkspacesLoadState.Empty)
    }

    @Test
    fun reportsApiFailure() = runTest(dispatcher) {
        val viewModel = WorkspacesViewModel(
            sessionGateway = FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            workspaceRepository = FakeWorkspaceRepository(
                apiFailure = AgentApiException(AgentApiError.Transport(RuntimeException("boom"))),
            ),
        )

        viewModel.refresh()
        advanceUntilIdle()

        val error = viewModel.uiState.value.loadState as WorkspacesLoadState.Error
        assertEquals("Could not reach Harold", error.message)
    }

    @Test
    fun keepsCachedWorkspacesWhenTheHaroldIsOffline() = runTest(dispatcher) {
        val repository = FakeWorkspaceRepository(
            apiFailure = AgentApiException(AgentApiError.Transport(RuntimeException("boom"))),
        )
        repository.seed(listOf(CachedWorkspace(ORIGIN, workspace())))
        val viewModel = WorkspacesViewModel(
            sessionGateway = FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
            workspaceRepository = repository,
        )

        viewModel.refresh()
        advanceUntilIdle()

        val loaded = viewModel.uiState.value.loadState as WorkspacesLoadState.Loaded
        assertEquals(listOf("ws_01"), loaded.workspaces.map { cached -> cached.id })
    }

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"

        fun workspace() = Workspace(
            id = "ws_01",
            name = "harold",
            path = "/tmp/harold",
            state = WorkspaceState.Available,
            createdAt = "2026-08-05T00:00:00.000Z",
            lastUsedAt = "2026-08-05T00:00:00.000Z",
        )
    }
}

private class FakeWorkspaceRepository(
    private val workspaces: List<Workspace> = listOf(
        Workspace(
            id = "ws_01",
            name = "harold",
            path = "/tmp/harold",
            state = WorkspaceState.Available,
            createdAt = "2026-08-05T00:00:00.000Z",
            lastUsedAt = "2026-08-05T00:00:00.000Z",
        ),
    ),
    private val apiFailure: Throwable? = null,
) : WorkspaceRepository {
    private val cached = MutableStateFlow<List<CachedWorkspace>>(emptyList())

    override fun observe(): Flow<List<CachedWorkspace>> = cached

    override fun observe(serverOrigin: String): Flow<List<CachedWorkspace>> =
        cached.map { workspaces -> workspaces.filter { cached -> cached.serverOrigin == serverOrigin } }

    override suspend fun refresh(serverOrigin: String): Result<Unit> {
        apiFailure?.let { error -> return Result.failure(error) }
        cached.value = workspaces.map { workspace -> CachedWorkspace(serverOrigin, workspace) }
        return Result.success(Unit)
    }

    override suspend fun create(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = Result.failure(UnsupportedOperationException())

    fun seed(workspaces: List<CachedWorkspace>) {
        cached.value = workspaces
    }
}
