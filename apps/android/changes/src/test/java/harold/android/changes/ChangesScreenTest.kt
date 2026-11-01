package harold.android.changes

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import harold.android.contracts.GitChangedFile
import harold.android.contracts.GitChanges
import harold.android.contracts.GitChangesTotals
import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitRepository
import harold.android.contracts.GitScope
import harold.android.contracts.GitWorktree
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ChangesScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val files = listOf(
        changed("apps/android/a.kt", 20, 2),
        changed("apps/android/FileTree.kt", 19),
        changed("README.md", 4, 1),
    )

    @Test
    fun rendersScopesAndForwardsFileClicks() {
        var clicked: String? = null
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChangesScreen(
                    uiState = loadedState(),
                    onBack = {},
                    onRefresh = {},
                    onRetry = {},
                    onWorktreeClick = {},
                    onWorktreeSelect = {},
                    onDismissWorktreeSheet = {},
                    onScopeSelect = {},
                    onToggleFolder = {},
                    onToggleAllFolders = {},
                    onFileClick = { file -> clicked = file.path },
                )
            }
        }

        composeTestRule.onNodeWithText("Uncommitted (3)").assertIsDisplayed()
        composeTestRule.onNodeWithText("Against main (0)").assertIsDisplayed()
        composeTestRule.onNodeWithTag("changes_summary").assertIsDisplayed()
        composeTestRule.onNodeWithTag("changes_list")
            .performScrollToNode(hasTestTag("changes_file_README.md"))
        composeTestRule.onNodeWithTag("changes_file_README.md").performClick()

        assertEquals("README.md", clicked)
    }

    @Test
    fun folderAndCollapseAllActionsUpdateTheTree() {
        var state by mutableStateOf(loadedState())
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChangesScreen(
                    uiState = state,
                    onBack = {},
                    onRefresh = {},
                    onRetry = {},
                    onWorktreeClick = {},
                    onWorktreeSelect = {},
                    onDismissWorktreeSheet = {},
                    onScopeSelect = { state = state.copy(scope = it) },
                    onToggleFolder = { path ->
                        state = state.copy(
                            collapsedFolders = if (path in state.collapsedFolders) {
                                state.collapsedFolders - path
                            } else {
                                state.collapsedFolders + path
                            },
                        )
                    },
                    onToggleAllFolders = { folders ->
                        state = state.copy(
                            collapsedFolders = if (state.collapsedFolders.containsAll(folders)) {
                                state.collapsedFolders - folders
                            } else {
                                state.collapsedFolders + folders
                            },
                        )
                    },
                    onFileClick = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("changes_file_apps/android/a.kt").assertIsDisplayed()
        composeTestRule.onNodeWithTag("changes_folder_apps/android").performClick()
        composeTestRule.onNodeWithTag("changes_file_apps/android/a.kt").assertDoesNotExist()

        composeTestRule.onNodeWithTag("changes_folder_apps/android").performClick()
        composeTestRule.onNodeWithTag("changes_file_apps/android/a.kt").assertIsDisplayed()
        composeTestRule.onNodeWithTag("changes_collapse_all").performClick()
        composeTestRule.onNodeWithTag("changes_file_apps/android/a.kt").assertDoesNotExist()
    }

    @Test
    fun branchSegmentSelectsBranchScope() {
        var selected: GitScope? = null
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChangesScreen(
                    uiState = loadedState(),
                    onBack = {},
                    onRefresh = {},
                    onRetry = {},
                    onWorktreeClick = {},
                    onWorktreeSelect = {},
                    onDismissWorktreeSheet = {},
                    onScopeSelect = { selected = it },
                    onToggleFolder = {},
                    onToggleAllFolders = {},
                    onFileClick = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("changes_segment_branch").performClick()

        assertEquals(GitScope.Branch, selected)
    }

    @Test
    fun worktreeFooterShowsTheActiveBranchAndOpensTheSheet() {
        var opened = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChangesScreen(
                    uiState = loadedState(),
                    onBack = {},
                    onRefresh = {},
                    onRetry = {},
                    onWorktreeClick = { opened = true },
                    onWorktreeSelect = {},
                    onDismissWorktreeSheet = {},
                    onScopeSelect = {},
                    onToggleFolder = {},
                    onToggleAllFolders = {},
                    onFileClick = {},
                )
            }
        }

        composeTestRule.onNodeWithText("feat/preview").assertIsDisplayed()
        composeTestRule.onNodeWithTag("changes_worktree_control").performClick()

        assertTrue(opened)
    }

    @Test
    fun worktreeSheetListsEveryWorktreeAndSelectsOne() {
        var selected: String? = null
        var state by mutableStateOf(loadedState(worktreeSheetVisible = true))
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChangesScreen(
                    uiState = state,
                    onBack = {},
                    onRefresh = {},
                    onRetry = {},
                    onWorktreeClick = {},
                    onWorktreeSelect = { path ->
                        selected = path
                        state = state.copy(
                            worktreeSheetVisible = false,
                            selectedWorktreePath = path,
                        )
                    },
                    onDismissWorktreeSheet = {
                        state = state.copy(worktreeSheetVisible = false)
                    },
                    onScopeSelect = {},
                    onToggleFolder = {},
                    onToggleAllFolders = {},
                    onFileClick = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("changes_worktree_row_main").performClick()

        assertEquals("/repo", selected)
    }

    @Test
    fun emptyScopeShowsTheCleanState() {
        val empty = loadedState().copy(
            uncommitted = ChangesGroup(
                GitChanges(
                    scope = GitScope.Uncommitted,
                    headSha = "abc1234",
                    files = emptyList(),
                    totals = GitChangesTotals(0, 0, 0),
                ),
            ),
        )
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChangesScreen(
                    uiState = empty,
                    onBack = {},
                    onRefresh = {},
                    onRetry = {},
                    onWorktreeClick = {},
                    onWorktreeSelect = {},
                    onDismissWorktreeSheet = {},
                    onScopeSelect = {},
                    onToggleFolder = {},
                    onToggleAllFolders = {},
                    onFileClick = {},
                )
            }
        }

        composeTestRule.onNodeWithText("No uncommitted changes").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("changes_file_README.md").assertCountEquals(0)
    }

    private fun loadedState(
        worktreeSheetVisible: Boolean = false,
    ): ChangesUiState = ChangesUiState(
        loading = false,
        repository = GitRepository(
            root = "/repo",
            currentWorktreePath = "/repo/.worktrees/feat/preview",
            currentBranch = "feat/preview",
            defaultBranch = "main",
            headSha = "abc1234",
        ),
        worktrees = listOf(
            GitWorktree(
                path = "/repo/.worktrees/feat/preview",
                branch = "feat/preview",
                headSha = "abc1234",
                isCurrent = true,
                isMain = false,
                dirtyFileCount = 3,
            ),
            GitWorktree(
                path = "/repo",
                branch = "main",
                headSha = "def5678",
                isCurrent = false,
                isMain = true,
                dirtyFileCount = 0,
            ),
        ),
        selectedWorktreePath = "/repo/.worktrees/feat/preview",
        scope = GitScope.Uncommitted,
        uncommitted = ChangesGroup(
            GitChanges(
                scope = GitScope.Uncommitted,
                headSha = "abc1234",
                files = files,
                totals = GitChangesTotals(
                    files = 3,
                    additions = 43,
                    deletions = 3,
                ),
            ),
        ),
        branch = ChangesGroup(
            GitChanges(
                scope = GitScope.Branch,
                baseRef = "main",
                mergeBaseSha = "mergebase",
                headSha = "abc1234",
                files = emptyList(),
                totals = GitChangesTotals(0, 0, 0),
            ),
        ),
        worktreeSheetVisible = worktreeSheetVisible,
    )

    private fun changed(
        path: String,
        additions: Int?,
        deletions: Int? = null,
    ): GitChangedFile = GitChangedFile(
        path = path,
        status = GitFileStatus.Modified,
        additions = additions,
        deletions = deletions,
    )
}
