package harold.android.changes

import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitScope
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FixtureGitApiTest {
    @Test
    fun nestedWorktreePathsResolveToTheLongestMatch() {
        val summary = MockGitData.summaryFor(MockGitData.DOCS)

        assertEquals("docs/review-copy", summary.repository.currentBranch)
        assertEquals("main", summary.repository.defaultBranch)
    }

    @Test
    fun uncommittedTotalsMatchTheListedFiles() {
        val changes = MockGitData.changesFor(MockGitData.CURRENT, GitScope.Uncommitted)

        assertEquals(17, changes.totals.files)
        assertEquals(340, changes.totals.additions)
        assertEquals(120, changes.totals.deletions)
        assertEquals(
            changes.totals.additions,
            changes.files.sumOf { it.additions ?: 0 },
        )
        assertEquals(
            changes.totals.deletions,
            changes.files.sumOf { it.deletions ?: 0 },
        )
    }

    @Test
    fun binaryAndSubmoduleFilesDoNotHaveHunks() {
        val binary = MockGitData.diffFor(
            worktreePath = MockGitData.CURRENT,
            scope = GitScope.Uncommitted,
            filePath = "docs/demo/capture/logo.png",
        )
        assertTrue(binary.binary)
        assertTrue(binary.hunks.isEmpty())

        val submodule = MockGitData.diffFor(
            worktreePath = MockGitData.CURRENT,
            scope = GitScope.Uncommitted,
            filePath = "vendor/submodule",
        )
        assertTrue(submodule.submodule)
        assertTrue(submodule.hunks.isEmpty())
    }

    @Test
    fun branchDiffMarksTheLargeAdapterDiffTruncated() {
        val diff = MockGitData.diffFor(
            worktreePath = MockGitData.CURRENT,
            scope = GitScope.Branch,
            filePath = "apps/server/src/git/git.node.adapters.ts",
        )

        assertEquals(GitFileStatus.Added, diff.status)
        assertTrue(diff.truncated)
        assertFalse(diff.hunks.isEmpty())
    }
}
