package harold.android.changes

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import harold.android.contracts.GitDiffHunk
import harold.android.contracts.GitDiffLine
import harold.android.contracts.GitDiffLineKind
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitScope
import harold.android.ui.theme.HaroldTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class FileDiffScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun rendersHunkLinesWithLineNumbers() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                FileDiffScreen(
                    uiState = loaded(diff()),
                    onBack = {},
                    onRetry = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("file_diff_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("diff_gutter").assertIsDisplayed()
        composeTestRule.onNodeWithText("val preview = ChangesScreen()").assertIsDisplayed()
        composeTestRule.onNodeWithText("val old = LegacyScreen()").assertIsDisplayed()
    }

    @Test
    fun binaryDiffShowsTheNoticeInsteadOfHunks() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                FileDiffScreen(
                    uiState = loaded(
                        diff().copy(
                            binary = true,
                            hunks = emptyList(),
                        ),
                    ),
                    onBack = {},
                    onRetry = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("file_diff_binary").assertIsDisplayed()
        composeTestRule.onNodeWithText("Binary file changed").assertIsDisplayed()
    }

    @Test
    fun truncatedDiffShowsTheLimitNotice() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                FileDiffScreen(
                    uiState = loaded(diff().copy(truncated = true)),
                    onBack = {},
                    onRetry = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("file_diff_truncated").assertIsDisplayed()
        composeTestRule.onNodeWithText("Diff truncated at 2,000 lines.").assertIsDisplayed()
    }

    private fun loaded(diff: GitFileDiff): FileDiffUiState = FileDiffUiState(
        loading = false,
        worktreePath = "/repo",
        scope = GitScope.Uncommitted,
        filePath = diff.path,
        diff = diff,
    )

    private fun diff(): GitFileDiff = GitFileDiff(
        path = "apps/android/changes/ChangesScreen.kt",
        status = GitFileStatus.Modified,
        hunks = listOf(
            GitDiffHunk(
                header = "@@ -1,3 +1,4 @@",
                oldStart = 1,
                oldLines = 3,
                newStart = 1,
                newLines = 4,
                lines = listOf(
                    GitDiffLine(
                        kind = GitDiffLineKind.Context,
                        oldLineNumber = 1,
                        newLineNumber = 1,
                        text = "package harold.android.changes",
                    ),
                    GitDiffLine(
                        kind = GitDiffLineKind.Deletion,
                        oldLineNumber = 2,
                        text = "val old = LegacyScreen()",
                    ),
                    GitDiffLine(
                        kind = GitDiffLineKind.Addition,
                        newLineNumber = 2,
                        text = "val preview = ChangesScreen()",
                    ),
                    GitDiffLine(
                        kind = GitDiffLineKind.Context,
                        oldLineNumber = 3,
                        newLineNumber = 3,
                        text = "",
                    ),
                ),
            ),
        ),
    )
}
