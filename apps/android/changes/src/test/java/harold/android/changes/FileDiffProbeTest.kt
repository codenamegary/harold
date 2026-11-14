package harold.android.changes

import harold.android.contracts.GitDiffHunk
import harold.android.contracts.GitDiffLine
import harold.android.contracts.GitDiffLineKind
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitScope
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FileDiffProbeTest {

    @Test
    fun factsExposeThePathAndEnoughStateToKnowTheDiffRendered() {
        val probe = FileDiffProbe(FakeFileDiffProbeHost(state()))

        val facts = probe.facts()

        assertEquals("src/settings.js", facts["path"])
        assertEquals("uncommitted", facts["scope"])
        assertEquals("1", facts["hunkCount"])
        assertEquals("3", facts["lineCount"])
        assertEquals("true", facts["truncated"])
        assertEquals("false", facts["loading"])
        assertEquals("", facts["error"])
    }

    @Test
    fun factsFallBackToTheRequestedPathWhileTheDiffLoads() {
        val loading = FileDiffUiState(
            loading = true,
            scope = GitScope.Branch,
            filePath = "src/settings.js",
        )
        val probe = FileDiffProbe(FakeFileDiffProbeHost(loading))

        val facts = probe.facts()

        assertEquals("src/settings.js", facts["path"])
        assertEquals("branch", facts["scope"])
        assertEquals("0", facts["hunkCount"])
        assertEquals("0", facts["lineCount"])
        assertEquals("false", facts["truncated"])
        assertEquals("true", facts["loading"])
        assertFalse(probe.settled())
    }

    @Test
    fun settledIsTrueOnlyWhenNoDiffRequestIsInFlight() {
        assertTrue(fileDiffProbeSettled(state()))
        assertFalse(fileDiffProbeSettled(state().copy(loading = true)))
    }

    @Test
    fun backAndReloadDispatchOntoTheScreenCallbacks() {
        val host = FakeFileDiffProbeHost(state())
        val probe = FileDiffProbe(host)

        assertTrue(probe.perform("back", emptyMap()))
        assertTrue(probe.perform("reload", emptyMap()))

        assertEquals(listOf("back", "reload"), host.calls)
        assertEquals(listOf("back", "reload"), probe.actions())
    }

    @Test
    fun unknownActionsAreRefused() {
        val host = FakeFileDiffProbeHost(state())
        val probe = FileDiffProbe(host)

        assertFalse(probe.perform("type", emptyMap()))
        assertFalse(probe.perform("select_scope", mapOf("value" to "branch")))
        assertTrue(host.calls.isEmpty())
    }
}

private class FakeFileDiffProbeHost(
    initialState: FileDiffUiState,
) : FileDiffProbeHost {
    private var current: FileDiffUiState = initialState
    val calls = mutableListOf<String>()

    override fun state(): FileDiffUiState = current

    override fun reload() {
        calls += "reload"
    }

    override fun back() {
        calls += "back"
    }
}

private fun diffLine(newLineNumber: Int, text: String) = GitDiffLine(
    kind = GitDiffLineKind.Addition,
    oldLineNumber = null,
    newLineNumber = newLineNumber,
    text = text,
)

private fun state() = FileDiffUiState(
    loading = false,
    scope = GitScope.Uncommitted,
    filePath = "src/settings.js",
    diff = GitFileDiff(
        path = "src/settings.js",
        status = GitFileStatus.Modified,
        additions = 3,
        deletions = 0,
        hunks = listOf(
            GitDiffHunk(
                header = "@@ -1,2 +1,3 @@",
                oldStart = 1,
                oldLines = 2,
                newStart = 1,
                newLines = 3,
                lines = listOf(
                    diffLine(1, "const catMode = true"),
                    diffLine(2, "export { catMode }"),
                    diffLine(3, ""),
                ),
            ),
        ),
        truncated = true,
    ),
)
