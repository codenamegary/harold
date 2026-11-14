package harold.android.changes

import harold.android.contracts.GitChangedFile
import harold.android.contracts.GitChanges
import harold.android.contracts.GitChangesTotals
import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitRepository
import harold.android.contracts.GitScope
import harold.android.contracts.GitWorktree
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChangesProbeTest {

    @Test
    fun factsReportTheActiveScopeTheFilesAndTheWorktrees() {
        val probe = ChangesProbe(FakeChangesProbeHost(state()))

        val facts = probe.facts()

        assertEquals("uncommitted", facts["scope"])
        assertEquals("main", facts["baseBranch"])
        assertEquals("2", facts["uncommittedCount"])
        assertEquals("1", facts["branchCount"])
        assertEquals("2", facts["fileCount"])
        assertEquals("src/settings.js|src/cat-mode.js", facts["filePaths"])
        assertEquals("feat/cat-mode", facts["worktreeBranch"])
        assertEquals("false", facts["worktreeSheetOpen"])
        assertEquals("2", facts["worktreeCount"])
        assertEquals("feat/cat-mode|main", facts["worktreeBranches"])
        assertEquals("false", facts["loading"])
        assertEquals("false", facts["empty"])
        assertEquals("", facts["error"])
    }

    @Test
    fun factsSayTheTreeIsCleanWhenTheScopeHasNoFiles() {
        val probe = ChangesProbe(
            FakeChangesProbeHost(state().copy(uncommitted = null)),
        )

        val facts = probe.facts()

        assertEquals("0", facts["fileCount"])
        assertEquals("", facts["filePaths"])
        assertEquals("true", facts["empty"])
    }

    @Test
    fun settledIsFalseWhileALoadOrRefreshIsInFlight() {
        assertTrue(changesProbeSettled(state()))
        assertFalse(changesProbeSettled(state().copy(loading = true)))
        assertFalse(changesProbeSettled(state().copy(refreshing = true)))
    }

    @Test
    fun actionsDispatchOntoTheViewModelCallsTheScreenUses() {
        val host = FakeChangesProbeHost(state())
        val probe = ChangesProbe(host)

        assertTrue(probe.perform("select_scope", mapOf("value" to "branch")))
        assertTrue(probe.perform("open_file", mapOf("path" to "src/settings.js")))
        assertTrue(probe.perform("open_worktree_sheet", emptyMap()))
        assertTrue(probe.perform("dismiss_worktree_sheet", emptyMap()))
        assertTrue(probe.perform("pick_worktree", mapOf("branch" to "main")))
        assertTrue(probe.perform("refresh", emptyMap()))
        assertTrue(probe.perform("back", emptyMap()))

        assertEquals(
            listOf(
                "selectScope:branch",
                "openFile:src/settings.js",
                "showWorktreeSheet",
                "hideWorktreeSheet",
                "selectWorktree:/work/harold",
                "refresh",
                "back",
            ),
            host.calls,
        )
    }

    @Test
    fun unknownActionsAndMissingTargetsAreRefused() {
        val host = FakeChangesProbeHost(state())
        val probe = ChangesProbe(host)

        assertFalse(probe.perform("type", emptyMap()))
        assertFalse(probe.perform("select_scope", mapOf("value" to "cat")))
        assertFalse(probe.perform("open_file", mapOf("path" to "src/missing.js")))
        assertFalse(probe.perform("pick_worktree", mapOf("branch" to "gone")))
        assertTrue(host.calls.isEmpty())
        assertEquals(
            listOf(
                "select_scope",
                "open_file",
                "open_worktree_sheet",
                "dismiss_worktree_sheet",
                "pick_worktree",
                "refresh",
                "back",
            ),
            probe.actions(),
        )
    }

    @Test
    fun branchScopeIsRefusedWhenTheRepositoryIsOnItsDefaultBranch() {
        val onMain = state().copy(repository = repository().copy(currentBranch = "main"))
        val host = FakeChangesProbeHost(onMain)
        val probe = ChangesProbe(host)

        assertFalse(onMain.branchScopeAvailable)
        assertFalse(probe.perform("select_scope", mapOf("value" to "branch")))
        assertTrue(host.calls.isEmpty())
    }

    @Test
    fun tagNamesMatchTheStringsTheScreensApply() {
        assertEquals("changes_file_src/settings.js", changesFileTag("src/settings.js"))
        assertEquals("changes_folder_src", changesFolderTag("src"))
        assertEquals(
            "changes_worktree_row_feat/cat-mode",
            changesWorktreeRowTag("feat/cat-mode"),
        )
    }
}

private class FakeChangesProbeHost(
    initialState: ChangesUiState,
) : ChangesProbeHost {
    private var current: ChangesUiState = initialState
    val calls = mutableListOf<String>()

    override fun state(): ChangesUiState = current

    override fun selectScope(scope: GitScope) {
        current = current.copy(scope = scope)
        calls += "selectScope:${scopeFact(scope)}"
    }

    override fun openFile(file: GitChangedFile) {
        calls += "openFile:${file.path}"
    }

    override fun showWorktreeSheet() {
        current = current.copy(worktreeSheetVisible = true)
        calls += "showWorktreeSheet"
    }

    override fun hideWorktreeSheet() {
        current = current.copy(worktreeSheetVisible = false)
        calls += "hideWorktreeSheet"
    }

    override fun selectWorktree(path: String) {
        current = current.copy(selectedWorktreePath = path, worktreeSheetVisible = false)
        calls += "selectWorktree:$path"
    }

    override fun refresh() {
        calls += "refresh"
    }

    override fun back() {
        calls += "back"
    }
}

private fun scopeFact(scope: GitScope): String =
    if (scope == GitScope.Branch) "branch" else "uncommitted"

private fun file(path: String) = GitChangedFile(
    path = path,
    status = GitFileStatus.Modified,
    additions = 3,
    deletions = 1,
)

private fun changes(scope: GitScope, files: List<GitChangedFile>) = GitChanges(
    scope = scope,
    headSha = "abc1234def",
    files = files,
    totals = GitChangesTotals(files = files.size, additions = 3, deletions = 1),
)

private fun worktree(
    path: String,
    branch: String,
    isCurrent: Boolean,
    isMain: Boolean,
) = GitWorktree(
    path = path,
    branch = branch,
    headSha = "abc1234def",
    isCurrent = isCurrent,
    isMain = isMain,
    dirtyFileCount = 0,
)

private fun repository() = GitRepository(
    root = "/work/cat-screensaver",
    currentWorktreePath = "/work/cat-mode",
    currentBranch = "feat/cat-mode",
    defaultBranch = "main",
    headSha = "abc1234def",
)

private fun state() = ChangesUiState(
    loading = false,
    repository = repository(),
    worktrees = listOf(
        worktree(
            path = "/work/cat-mode",
            branch = "feat/cat-mode",
            isCurrent = true,
            isMain = false,
        ),
        worktree(
            path = "/work/harold",
            branch = "main",
            isCurrent = false,
            isMain = true,
        ),
    ),
    selectedWorktreePath = "/work/cat-mode",
    scope = GitScope.Uncommitted,
    uncommitted = ChangesGroup(
        changes(
            scope = GitScope.Uncommitted,
            files = listOf(file("src/settings.js"), file("src/cat-mode.js")),
        ),
    ),
    branch = ChangesGroup(
        changes(
            scope = GitScope.Branch,
            files = listOf(file("src/settings.js")),
        ),
    ),
)
