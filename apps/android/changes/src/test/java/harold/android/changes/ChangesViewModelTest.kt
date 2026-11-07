package harold.android.changes

import harold.android.contracts.GitChanges
import harold.android.contracts.GitChangesTotals
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitRepository
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktree
import harold.android.contracts.GitWorktreeCollection
import harold.android.contracts.SetSessionWorktreePathBody
import harold.android.network.GitApi
import harold.android.network.SessionWorktreePathApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
class ChangesViewModelTest {
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
    fun startUsesTheStoredWorktreePathWhenItIsStillListed() = runTest(dispatcher) {
        val git = FakeGitApi()
        val sessions = FakeWorktreePathApi()
        val viewModel = ChangesViewModel(git, sessions)

        viewModel.start(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessionId = "sess_01",
            cwd = REPO,
            worktreePath = LINKED,
        )
        advanceUntilIdle()

        assertEquals(LINKED, viewModel.uiState.value.selectedWorktreePath)
        assertTrue(sessions.updates.isEmpty())
    }

    @Test
    fun startFallsBackAndClearsAStaleStoredPath() = runTest(dispatcher) {
        val git = FakeGitApi()
        val sessions = FakeWorktreePathApi()
        val viewModel = ChangesViewModel(git, sessions)

        viewModel.start(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessionId = "sess_01",
            cwd = REPO,
            worktreePath = "/repo/.worktrees/missing",
        )
        advanceUntilIdle()

        assertEquals(REPO, viewModel.uiState.value.selectedWorktreePath)
        assertEquals(
            listOf(SetSessionWorktreePathBody(agentId = "cursor", worktreePath = null)),
            sessions.updates.map { it.second },
        )
    }

    @Test
    fun manualSelectionUpdatesTheSessionEndpoint() = runTest(dispatcher) {
        val git = FakeGitApi()
        val sessions = FakeWorktreePathApi()
        val viewModel = ChangesViewModel(git, sessions)
        viewModel.start(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessionId = "sess_01",
            cwd = REPO,
            worktreePath = null,
        )
        advanceUntilIdle()

        viewModel.selectWorktree(LINKED)

        assertEquals(LINKED, viewModel.uiState.value.selectedWorktreePath)
        advanceUntilIdle()
        assertEquals(
            listOf(SetSessionWorktreePathBody(agentId = "cursor", worktreePath = LINKED)),
            sessions.updates.map { it.second },
        )
    }

    @Test
    fun failedManualSelectionShowsTheExistingErrorState() = runTest(dispatcher) {
        val git = FakeGitApi()
        val sessions = FakeWorktreePathApi(
            failure = IllegalStateException("worktree path rejected"),
        )
        val viewModel = ChangesViewModel(git, sessions)
        viewModel.start(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessionId = "sess_01",
            cwd = REPO,
            worktreePath = null,
        )
        advanceUntilIdle()

        viewModel.selectWorktree(LINKED)
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.error != null)
    }

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
        const val REPO = "/repo"
        const val LINKED = "/repo/.worktrees/feat-x"
    }
}

private class FakeWorktreePathApi(
    private val failure: Throwable? = null,
) : SessionWorktreePathApi {
    val updates = mutableListOf<Pair<String, SetSessionWorktreePathBody>>()

    override suspend fun updateSessionWorktreePath(
        connectionId: String,
        sessionId: String,
        body: SetSessionWorktreePathBody,
    ): Result<Unit> {
        updates += sessionId to body
        return failure?.let { Result.failure(it) } ?: Result.success(Unit)
    }
}

private class FakeGitApi : GitApi {
    private val repository = GitRepository(
        root = REPO,
        currentWorktreePath = REPO,
        currentBranch = "main",
        defaultBranch = "main",
        headSha = "abc1234",
    )
    private val worktrees = listOf(
        GitWorktree(
            path = REPO,
            branch = "main",
            headSha = "abc1234",
            isCurrent = true,
            isMain = true,
            dirtyFileCount = 0,
        ),
        GitWorktree(
            path = LINKED,
            branch = "feat-x",
            headSha = "def5678",
            isCurrent = false,
            isMain = false,
            dirtyFileCount = 2,
        ),
    )

    override suspend fun getSummary(
        connectionId: String,
        path: String,
    ): Result<GitSummary> = Result.success(GitSummary(repository, 0))

    override suspend fun listWorktrees(
        connectionId: String,
        path: String,
    ): Result<GitWorktreeCollection> = Result.success(GitWorktreeCollection(worktrees))

    override suspend fun getChanges(
        connectionId: String,
        path: String,
        scope: GitScope,
    ): Result<GitChanges> = Result.success(
        GitChanges(
            scope = scope,
            headSha = "abc1234",
            files = emptyList(),
            totals = GitChangesTotals(files = 0, additions = 0, deletions = 0),
        ),
    )

    override suspend fun getFileDiff(
        connectionId: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String?,
    ): Result<GitFileDiff> = Result.failure(UnsupportedOperationException("unused"))

    private companion object {
        const val REPO = "/repo"
        const val LINKED = "/repo/.worktrees/feat-x"
    }
}
