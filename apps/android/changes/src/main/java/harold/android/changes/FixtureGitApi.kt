package harold.android.changes

import harold.android.contracts.GitChangedFile
import harold.android.contracts.GitChanges
import harold.android.contracts.GitChangesTotals
import harold.android.contracts.GitDiffHunk
import harold.android.contracts.GitDiffLine
import harold.android.contracts.GitDiffLineKind
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitRepository
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktree
import harold.android.contracts.GitWorktreeCollection
import javax.inject.Inject

/**
 * Static stand-in for the server's `/v1/git/...` routes. Every value here matches
 * the shape in issue #468, so swapping in a network [harold.android.network.GitApi]
 * later should not change the screens.
 */
class FixtureGitApi @Inject constructor() :
    harold.android.network.GitApi {
    override suspend fun getSummary(
        serverOrigin: String,
        path: String,
    ): Result<GitSummary> {
        mockLatency()
        return Result.success(MockGitData.summaryFor(path))
    }

    override suspend fun listWorktrees(
        serverOrigin: String,
        path: String,
    ): Result<GitWorktreeCollection> {
        mockLatency()
        return Result.success(GitWorktreeCollection(items = MockGitData.worktrees))
    }

    override suspend fun getChanges(
        serverOrigin: String,
        path: String,
        scope: GitScope,
    ): Result<GitChanges> {
        mockLatency()
        return Result.success(MockGitData.changesFor(path, scope))
    }

    override suspend fun getFileDiff(
        serverOrigin: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String?,
    ): Result<GitFileDiff> {
        mockLatency()
        return Result.success(MockGitData.diffFor(worktreePath, scope, filePath))
    }

    private suspend fun mockLatency() {
        kotlinx.coroutines.delay(180)
    }
}

internal object MockGitData {
    const val ROOT = "/home/codenamegary/sites/harold"
    const val CURRENT = "$ROOT/.worktrees/feat/issue-468-git-changes"
    const val MAIN = ROOT
    const val DOCS = "$ROOT/.worktrees/docs/review-copy"
    const val OTHER = "$ROOT/.worktrees/feat/issue-466-acp-elicitation"

    private const val CURRENT_HEAD = "7c4f2a1e8b9d3c5f6a7b8c9d0e1f2a3b4c5d6e7f"
    private const val MAIN_HEAD = "34f760d19b3e4c5a6f7d8e9a0b1c2d3e4f5a6b7c"
    private const val DOCS_HEAD = "b81d0c2f4e6a8b0d2f4e6a8b0d2f4e6a8b0d2f4e"
    private const val OTHER_HEAD = "173af37b4c5d6e7f8091a2b3c4d5e6f708192a3b"

    val worktrees: List<GitWorktree> = listOf(
        GitWorktree(
            path = CURRENT,
            branch = "feat/issue-468-git-changes",
            headSha = CURRENT_HEAD,
            isCurrent = true,
            isMain = false,
            dirtyFileCount = 17,
        ),
        GitWorktree(
            path = MAIN,
            branch = "main",
            headSha = MAIN_HEAD,
            isCurrent = false,
            isMain = true,
            dirtyFileCount = 0,
        ),
        GitWorktree(
            path = DOCS,
            branch = "docs/review-copy",
            headSha = DOCS_HEAD,
            isCurrent = false,
            isMain = false,
            dirtyFileCount = 1,
        ),
        GitWorktree(
            path = OTHER,
            branch = "feat/issue-466-acp-elicitation",
            headSha = OTHER_HEAD,
            isCurrent = false,
            isMain = false,
            dirtyFileCount = 2,
        ),
    )

    fun summaryFor(path: String): GitSummary {
        val worktree = worktrees
            .filter { candidate ->
                path == candidate.path || path.startsWith(candidate.path.trimEnd('/') + "/")
            }
            .maxByOrNull { it.path.length }
            ?: worktrees.first()
        return GitSummary(
            repository = GitRepository(
                root = ROOT,
                currentWorktreePath = CURRENT,
                currentBranch = worktree.branch,
                defaultBranch = "main",
                headSha = worktree.headSha,
            ),
            uncommittedFileCount = worktrees.first { it.isCurrent }.dirtyFileCount ?: 0,
        )
    }

    fun changesFor(path: String, scope: GitScope): GitChanges = when {
        path == MAIN -> changes(
            scope = scope,
            files = if (scope == GitScope.Uncommitted) emptyList() else emptyList(),
            baseRef = "main",
        )

        path == DOCS -> changes(
            scope = scope,
            files = if (scope == GitScope.Uncommitted) docsFiles else emptyList(),
            baseRef = "main",
        )

        path == OTHER -> changes(
            scope = scope,
            files = if (scope == GitScope.Uncommitted) otherUncommittedFiles else otherBranchFiles,
            baseRef = "main",
        )

        else -> changes(
            scope = scope,
            files = if (scope == GitScope.Uncommitted) currentUncommittedFiles else currentBranchFiles,
            baseRef = "main",
            truncated = scope == GitScope.Branch,
        )
    }

    fun diffFor(worktreePath: String, scope: GitScope, filePath: String): GitFileDiff {
        val file = changesFor(worktreePath, scope).files.firstOrNull { it.path == filePath }
            ?: error("No fixture for $filePath")
        return GitFileDiff(
            path = file.path,
            oldPath = file.oldPath,
            status = file.status,
            additions = file.additions,
            deletions = file.deletions,
            binary = file.binary,
            submodule = file.submodule,
            hunks = if (file.binary || file.submodule) emptyList() else {
                specificHunks[file.path] ?: genericHunks(file)
            },
            truncated = file.path == "apps/server/src/git/git.node.adapters.ts" &&
                scope == GitScope.Branch,
        )
    }

    private fun changes(
        scope: GitScope,
        files: List<GitChangedFile>,
        baseRef: String?,
        truncated: Boolean = false,
    ): GitChanges = GitChanges(
        scope = scope,
        baseRef = baseRef,
        mergeBaseSha = if (scope == GitScope.Branch) "9e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b" else null,
        headSha = CURRENT_HEAD,
        files = files,
        totals = GitChangesTotals(
            files = files.size,
            additions = files.sumOf { it.additions ?: 0 },
            deletions = files.sumOf { it.deletions ?: 0 },
        ),
        truncated = truncated,
    )

    private val currentUncommittedFiles = listOf(
        changed(
            path = "apps/android/changes/src/main/java/harold/android/changes/ChangesScreen.kt",
            oldPath = "apps/android/chat/GitScreen.kt",
            status = GitFileStatus.Renamed,
            additions = 50,
        ),
        changed(
            path = "apps/android/changes/src/main/java/harold/android/changes/ChangesViewModel.kt",
            status = GitFileStatus.Added,
            additions = 74,
        ),
        changed(
            path = "apps/android/changes/src/main/java/harold/android/changes/FileDiffScreen.kt",
            status = GitFileStatus.Added,
            additions = 58,
        ),
        changed(
            path = "apps/android/changes/src/main/java/harold/android/changes/FileTree.kt",
            status = GitFileStatus.Added,
            additions = 43,
        ),
        changed(
            path = "apps/android/changes/src/main/java/harold/android/changes/ChangesFeature.kt",
            status = GitFileStatus.Added,
            additions = 22,
        ),
        changed(
            path = "apps/android/changes/build.gradle.kts",
            status = GitFileStatus.Added,
            additions = 14,
        ),
        changed(
            path = "apps/android/settings.gradle.kts",
            status = GitFileStatus.Modified,
            additions = 1,
        ),
        changed(
            path = "apps/android/app/build.gradle.kts",
            status = GitFileStatus.Modified,
            additions = 1,
        ),
        changed(
            path = "apps/android/navigation/src/main/java/harold/android/navigation/AppRoutes.kt",
            status = GitFileStatus.Modified,
            additions = 12,
        ),
        changed(
            path = "apps/android/navigation/src/main/java/harold/android/navigation/Navigator.kt",
            status = GitFileStatus.Modified,
            additions = 8,
        ),
        changed(
            path = "apps/android/chat/src/main/java/harold/android/chat/ChatScreen.kt",
            status = GitFileStatus.Modified,
            additions = 36,
            deletions = 2,
        ),
        changed(
            path = "apps/android/chat/src/main/java/harold/android/chat/ChatUiState.kt",
            status = GitFileStatus.Modified,
            additions = 2,
        ),
        changed(
            path = "apps/android/changes/src/test/java/harold/android/changes/FileTreeTest.kt",
            status = GitFileStatus.Untracked,
            additions = 19,
        ),
        changed(
            path = "apps/android/chat/composer/PromptComposer.kt",
            status = GitFileStatus.Modified,
            deletions = 74,
        ),
        changed(
            path = "legacy/ChangesPlaceholder.kt",
            status = GitFileStatus.Deleted,
            deletions = 44,
        ),
        changed(
            path = "docs/demo/capture/logo.png",
            status = GitFileStatus.Modified,
            binary = true,
        ),
        changed(
            path = "vendor/submodule",
            status = GitFileStatus.Modified,
            submodule = true,
        ),
    )

    private val currentBranchFiles = listOf(
        changed("packages/contracts/src/http/git.ts", GitFileStatus.Added, 186),
        changed("packages/contracts/src/http/git.test.ts", GitFileStatus.Added, 94),
        changed("apps/server/src/git/routes.ts", GitFileStatus.Added, 162),
        changed("apps/server/src/git/git.node.adapters.ts", GitFileStatus.Added, 248),
        changed("apps/server/src/git/diff.parser.ts", GitFileStatus.Added, 131),
        changed("apps/server/src/git/diff.parser.test.ts", GitFileStatus.Added, 119),
        changed("apps/server/src/bootstrap/server.ts", GitFileStatus.Modified, 12, 2),
        changed("apps/server/src/problems.ts", GitFileStatus.Modified, 18, 4),
        changed(
            "apps/android/contracts/src/main/java/harold/android/contracts/Git.kt",
            GitFileStatus.Added,
            168,
        ),
        changed(
            "apps/android/api/src/main/java/harold/android/network/GitApi.kt",
            GitFileStatus.Added,
            36,
        ),
        changed(
            "apps/android/changes/src/main/java/harold/android/changes/ChangesScreen.kt",
            GitFileStatus.Added,
            412,
        ),
        changed(
            "apps/android/changes/src/main/java/harold/android/changes/FileDiffScreen.kt",
            GitFileStatus.Added,
            238,
        ),
        changed(
            "apps/android/changes/src/main/java/harold/android/changes/ChangesViewModel.kt",
            GitFileStatus.Added,
            206,
        ),
        changed(
            "apps/android/changes/src/main/java/harold/android/changes/FileTree.kt",
            GitFileStatus.Added,
            91,
        ),
        changed("apps/android/settings.gradle.kts", GitFileStatus.Modified, 1),
        changed("apps/android/app/build.gradle.kts", GitFileStatus.Modified, 1),
        changed(
            "apps/android/chat/src/main/java/harold/android/chat/ChatScreen.kt",
            GitFileStatus.Modified,
            44,
            2,
        ),
    )

    private val otherUncommittedFiles = listOf(
        changed(
            path = "apps/android/chat/ElicitationSheet.kt",
            status = GitFileStatus.Modified,
            additions = 18,
            deletions = 4,
        ),
        changed(
            path = "packages/core/src/acp/elicitation.ts",
            status = GitFileStatus.Modified,
            additions = 31,
            deletions = 7,
        ),
    )

    private val otherBranchFiles = listOf(
        changed("packages/contracts/src/acp/elicitation.ts", GitFileStatus.Added, 86),
        changed("packages/core/src/acp/elicitation.ts", GitFileStatus.Modified, 140, 12),
        changed("packages/core/src/acp/elicitation.test.ts", GitFileStatus.Added, 112),
        changed("apps/server/src/sessions/elicitation.ts", GitFileStatus.Added, 64),
        changed("apps/server/src/sessions/elicitation.test.ts", GitFileStatus.Added, 89),
        changed(
            "apps/android/contracts/src/main/java/harold/android/contracts/Acp.kt",
            GitFileStatus.Modified,
            42,
            6,
        ),
        changed(
            "apps/android/chat/src/main/java/harold/android/chat/ElicitationSheet.kt",
            GitFileStatus.Modified,
            210,
            18,
        ),
        changed(
            "apps/android/chat/src/main/java/harold/android/chat/ElicitationPanel.kt",
            GitFileStatus.Modified,
            55,
            9,
        ),
        changed(
            "apps/android/chat/src/main/java/harold/android/chat/ElicitationUi.kt",
            GitFileStatus.Modified,
            44,
            3,
        ),
        changed(
            "apps/android/live/src/main/java/harold/android/live/Elicitation.kt",
            GitFileStatus.Added,
            96,
        ),
        changed(
            "apps/android/chat/src/main/java/harold/android/chat/ChatViewModel.kt",
            GitFileStatus.Modified,
            38,
            2,
        ),
    )

    private val docsFiles = listOf(
        changed("README.md", GitFileStatus.Modified, 12, 4),
    )

    private fun changed(
        path: String,
        status: GitFileStatus,
        additions: Int? = null,
        deletions: Int? = null,
        oldPath: String? = null,
        binary: Boolean = false,
        submodule: Boolean = false,
    ): GitChangedFile = GitChangedFile(
        path = path,
        oldPath = oldPath,
        status = status,
        additions = additions,
        deletions = deletions,
        binary = binary,
        submodule = submodule,
    )

    private data class Seed(
        val kind: GitDiffLineKind,
        val text: String,
    )

    private fun context(text: String) = Seed(GitDiffLineKind.Context, text)
    private fun addition(text: String) = Seed(GitDiffLineKind.Addition, text)
    private fun deletion(text: String) = Seed(GitDiffLineKind.Deletion, text)

    private fun hunk(
        oldStart: Int,
        newStart: Int,
        seeds: List<Seed>,
        detail: String = "",
    ): GitDiffHunk {
        var oldLine = oldStart
        var newLine = newStart
        val lines = seeds.map { seed ->
            when (seed.kind) {
                GitDiffLineKind.Context -> GitDiffLine(
                    kind = seed.kind,
                    oldLineNumber = oldLine++,
                    newLineNumber = newLine++,
                    text = seed.text,
                )

                GitDiffLineKind.Addition -> GitDiffLine(
                    kind = seed.kind,
                    newLineNumber = newLine++,
                    text = seed.text,
                )

                GitDiffLineKind.Deletion -> GitDiffLine(
                    kind = seed.kind,
                    oldLineNumber = oldLine++,
                    text = seed.text,
                )
            }
        }
        val oldLines = oldLine - oldStart
        val newLines = newLine - newStart
        val header = buildString {
            append("@@ -")
            append(oldStart)
            append(',')
            append(oldLines)
            append(" +")
            append(newStart)
            append(',')
            append(newLines)
            append(" @@")
            if (detail.isNotEmpty()) {
                append(' ')
                append(detail)
            }
        }
        return GitDiffHunk(
            header = header,
            oldStart = oldStart,
            oldLines = oldLines,
            newStart = newStart,
            newLines = newLines,
            lines = lines,
        )
    }

    private val specificHunks: Map<String, List<GitDiffHunk>> = mapOf(
        "apps/android/changes/src/main/java/harold/android/changes/ChangesScreen.kt" to listOf(
            hunk(
                detail = "import harold.android.ui.components.LoadingSkeletonList",
                oldStart = 18,
                newStart = 18,
                seeds = listOf(
                    context("import harold.android.contracts.GitChanges"),
                    deletion("import harold.android.contracts.GitScope"),
                    addition("import harold.android.contracts.GitScope"),
                    addition("import harold.android.contracts.GitSummary"),
                    addition("import harold.android.contracts.GitWorktree"),
                    context("import harold.android.ui.components.HaroldCard"),
                    context("import harold.android.ui.theme.diffColors"),
                ),
            ),
            hunk(
                detail = "fun ChangesScreen(",
                oldStart = 96,
                newStart = 103,
                seeds = listOf(
                    context("    val active = uiState.activeGroup"),
                    addition("    val summary = active?.changes?.totals"),
                    addition("    val branchAvailable = uiState.repository?.branchScopeAvailable == true"),
                    addition("    val selectedWorktree = uiState.worktrees.firstOrNull {"),
                    addition("        it.path == uiState.selectedWorktreePath,"),
                    addition("    }"),
                    context(""),
                    addition("    // This line is deliberately long so the diff body can prove that the code"),
                    addition("    // column scrolls horizontally while the line-number gutter stays put."),
                    addition("    val sessionCwd = \"/home/codenamegary/sites/harold/.worktrees/feat/issue-468-git-changes/apps/android/changes/src/main/java/harold/android/changes/ChangesScreen.kt\""),
                    context("    Scaffold("),
                    context("        topBar = { ChangesTopBar(onBack, onWorktreeClick) },"),
                    context("    ) { padding ->"),
                    deletion("        ChangesBody(uiState, padding)"),
                    addition("        ChangesBody("),
                    addition("            uiState = uiState,"),
                    addition("            selectedWorktree = selectedWorktree,"),
                    addition("            contentPadding = padding,"),
                    addition("        )"),
                    context("    }"),
                ),
            ),
        ),
        "apps/android/chat/src/main/java/harold/android/chat/ChatScreen.kt" to listOf(
            hunk(
                detail = "fun ChatScreen(",
                oldStart = 592,
                newStart = 592,
                seeds = listOf(
                    context("                actions = {"),
                    addition("                    if (changesAvailable) {"),
                    addition("                        ChangesAction("),
                    addition("                            count = changesBadgeCount,"),
                    addition("                            onClick = onChangesClick,"),
                    addition("                        )"),
                    addition("                    }"),
                    context("                    IconButton("),
                    context("                        onClick = { menuExpanded = true },"),
                    context("                        modifier = Modifier.testTag(\"chat_overflow\"),"),
                    context("                    ) {"),
                    context("                        Icon(Icons.Filled.MoreVert, contentDescription = null)"),
                    context("                    }"),
                ),
            ),
        ),
        "apps/android/changes/src/main/java/harold/android/changes/FileTree.kt" to listOf(
            hunk(
                oldStart = 1,
                newStart = 1,
                seeds = listOf(
                    addition("package harold.android.changes"),
                    addition(""),
                    addition("import harold.android.contracts.GitChangedFile"),
                    addition(""),
                    addition("data class FileTreeRow("),
                    addition("    val path: String,"),
                    addition("    val name: String,"),
                    addition("    val depth: Int,"),
                    addition("    val folder: Boolean,"),
                    addition("    val fileCount: Int,"),
                    addition("    val additions: Int,"),
                    addition("    val deletions: Int,"),
                    addition("    val file: GitChangedFile? = null,"),
                    addition(")"),
                    addition(""),
                    addition("fun buildFileTree(files: List<GitChangedFile>): List<FileTreeRow> ="),
                    addition("    folderFor(files).flatten()"),
                    addition(""),
                    addition("internal fun folderFor(files: List<GitChangedFile>): Folder ="),
                    addition("    Folder(name = \"\", path = \"\").apply {"),
                    addition("        files.forEach(::insert)"),
                    addition("    }"),
                ),
            ),
        ),
        "packages/contracts/src/http/git.ts" to listOf(
            hunk(
                oldStart = 1,
                newStart = 1,
                seeds = listOf(
                    addition("import { z } from \"zod\""),
                    addition(""),
                    addition("export const GitScopeSchema = z.enum([\"uncommitted\", \"branch\"])"),
                    addition(""),
                    addition("export const GitFileStatusSchema = z.enum(["),
                    addition("  \"added\","),
                    addition("  \"modified\","),
                    addition("  \"deleted\","),
                    addition("  \"renamed\","),
                    addition("  \"copied\","),
                    addition("  \"type_changed\","),
                    addition("  \"untracked\","),
                    addition("  \"conflicted\","),
                    addition("])"),
                    addition(""),
                    addition("export const GitWorktreeSchema = z.strictObject({"),
                    addition("  path: z.string().min(1),"),
                    addition("  branch: z.string().nullable(),"),
                    addition("  headSha: z.string().min(1),"),
                    addition("  isCurrent: z.boolean(),"),
                    addition("  isMain: z.boolean(),"),
                    addition("  dirtyFileCount: z.number().int().nonnegative().nullable(),"),
                    addition("})"),
                    addition(""),
                    addition("export const GitWorktreeCollectionSchema = z.strictObject({"),
                    addition("  items: z.array(GitWorktreeSchema),"),
                    addition("})"),
                ),
            ),
        ),
        "apps/server/src/git/git.node.adapters.ts" to listOf(
            hunk(
                oldStart = 1,
                newStart = 1,
                seeds = listOf(
                    addition("import { spawn } from \"node:child_process\""),
                    addition(""),
                    addition("const GIT_TIMEOUT_MS = 10_000"),
                    addition("const MAX_STDOUT_BYTES = 1_048_576"),
                    addition(""),
                    addition("export function runGit(cwd: string, args: readonly string[]) {"),
                    addition("  return spawn(\"git\", [\"-C\", cwd, ...args], {"),
                    addition("    env: {"),
                    addition("      ...process.env,"),
                    addition("      GIT_TERMINAL_PROMPT: \"0\","),
                    addition("      GIT_OPTIONAL_LOCKS: \"0\","),
                    addition("      LC_ALL: \"C\","),
                    addition("      GIT_PAGER: \"cat\","),
                    addition("    },"),
                    addition("    timeout: GIT_TIMEOUT_MS,"),
                    addition("  })"),
                    addition("}"),
                ),
            ),
            hunk(
                detail = "export async function readWorktrees(root: string) {",
                oldStart = 34,
                newStart = 60,
                seeds = listOf(
                    context("  const stdout = await collect(runGit(root, ["),
                    context("    \"worktree\", \"list\", \"--porcelain\", \"-z\","),
                    context("  ]))"),
                    addition("  return parseWorktreeList(stdout)"),
                    addition("    .filter((item) => !item.prunable && !item.bare)"),
                    addition("    .slice(0, 50)"),
                    context("}"),
                ),
            ),
        ),
        "README.md" to listOf(
            hunk(
                detail = "## Android app",
                oldStart = 38,
                newStart = 38,
                seeds = listOf(
                    context("Download `harold-android-<version>.apk` from the latest release."),
                    context(""),
                    addition("### Reviewing changes from chat"),
                    addition(""),
                    addition("Open a session and tap the **Changes** icon in the chat top bar."),
                    addition("The screen lists uncommitted files and the branch diff against `main`."),
                    addition("It is read-only: nothing is staged, committed, or pushed."),
                    context(""),
                    context("---"),
                ),
            ),
        ),
        "legacy/ChangesPlaceholder.kt" to listOf(
            hunk(
                oldStart = 1,
                newStart = 1,
                seeds = listOf(
                    deletion("package harold.android.chat"),
                    deletion(""),
                    deletion("import androidx.compose.runtime.Composable"),
                    deletion(""),
                    deletion("// Placeholder screen used while the git API was being designed."),
                    deletion("@Composable"),
                    deletion("fun GitScreenPlaceholder() {"),
                    deletion("    // TODO: replace with the real Changes surface."),
                    deletion("}"),
                ),
            ),
        ),
        "apps/android/chat/composer/PromptComposer.kt" to listOf(
            hunk(
                detail = "fun PromptComposer(",
                oldStart = 210,
                newStart = 210,
                seeds = listOf(
                    context("            ) {"),
                    context("                Icon(Icons.Filled.Send, contentDescription = null)"),
                    deletion("            }"),
                    deletion("            // Legacy prompt shortcut. The composer now owns this"),
                    deletion("            // surface, and the shortcut duplicated every click."),
                    deletion("            Box(Modifier.size(48.dp))"),
                    deletion("        }"),
                    context("    }"),
                ),
            ),
        ),
    )

    private fun genericHunks(file: GitChangedFile): List<GitDiffHunk> = when (file.status) {
        GitFileStatus.Added, GitFileStatus.Untracked -> {
            val added = listOf(
                addition("package ${packageFor(file.path)}"),
                addition(""),
                addition("// ${file.path.substringAfterLast('/')}"),
                addition("// Added in the mocked Changes preview."),
                addition(""),
                addition("internal fun preview(): String {"),
                addition("    return \"static data\""),
                addition("}"),
            )
            listOf(
                hunk(
                    oldStart = 1,
                    newStart = 1,
                    seeds = added,
                ),
            )
        }

        GitFileStatus.Deleted -> listOf(
            hunk(
                oldStart = 1,
                newStart = 1,
                seeds = (1..8).map { index ->
                    deletion("// removed line $index from ${file.path.substringAfterLast('/')}")
                },
            ),
        )

        else -> listOf(
            hunk(
                oldStart = 24,
                newStart = 24,
                seeds = listOf(
                    context("fun before() {"),
                    context("    val state = ChangesState()"),
                    deletion("    render(state)"),
                    addition("    render("),
                    addition("        state = state,"),
                    addition("        worktree = state.selectedWorktreePath,"),
                    addition("    )"),
                    context("}"),
                ),
            ),
            hunk(
                oldStart = 80,
                newStart = 85,
                seeds = listOf(
                    context("private fun unchanged() = Unit"),
                    addition(""),
                    addition("// Preview-only fixture content."),
                    context(""),
                ),
            ),
        )
    }

    private fun packageFor(path: String): String {
        val directory = path.substringBeforeLast('/', missingDelimiterValue = "")
        val packagePath = if (directory.contains("/java/")) {
            directory.substringAfter("/java/")
        } else {
            directory
        }
        return packagePath.replace('/', '.')
            .ifEmpty { "harold.android.changes" }
    }
}
