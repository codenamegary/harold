package harold.android.changes

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import harold.android.contracts.GitChangedFile
import harold.android.contracts.GitScope
import harold.android.ui.debug.Probe
import harold.android.ui.debug.ScreenProbe

/**
 * Debug control plane adapter for the changes screen.
 *
 * The changes surface owns two overlays: the scope segments and the worktree
 * sheet. `Probe.install` clears the control map and only one probe is live at a
 * time, so the worktree sheet is reached through this probe's actions rather
 * than a second registration.
 *
 * This file is compiled into every build because [ChangesScreen] and this probe
 * share a module, but it does nothing unless the debug build's initializer sets
 * [Probe.enabled]. Release builds install no probe, so the registry stays empty.
 */
@Composable
fun ChangesProbeEffect(
    viewModel: ChangesViewModel,
    onOpenFile: (GitChangedFile) -> Unit = {},
    onBack: () -> Unit = {},
) {
    DisposableEffect(viewModel) {
        if (!Probe.enabled) {
            return@DisposableEffect onDispose {}
        }
        val probe = ChangesProbe(
            ChangesViewModelProbeHost(
                viewModel = viewModel,
                onOpenFile = onOpenFile,
                onBack = onBack,
            ),
        )
        Probe.install(probe)
        onDispose { Probe.uninstall(probe) }
    }
}

/**
 * Everything the probe needs from the screen, behind one narrow port so the
 * probe's dispatch can be tested without a Hilt graph or a compose runtime.
 */
internal interface ChangesProbeHost {
    fun state(): ChangesUiState

    fun selectScope(scope: GitScope)

    fun openFile(file: GitChangedFile)

    fun showWorktreeSheet()

    fun hideWorktreeSheet()

    fun selectWorktree(path: String)

    fun refresh()

    fun back()
}

/**
 * Commands map onto the same ViewModel methods the screen calls, so the app's
 * own state machine decides what is allowed.
 */
internal class ChangesViewModelProbeHost(
    private val viewModel: ChangesViewModel,
    private val onOpenFile: (GitChangedFile) -> Unit,
    private val onBack: () -> Unit,
) : ChangesProbeHost {
    override fun state(): ChangesUiState = viewModel.uiState.value

    override fun selectScope(scope: GitScope) {
        viewModel.selectScope(scope)
    }

    override fun openFile(file: GitChangedFile) {
        onOpenFile(file)
    }

    override fun showWorktreeSheet() {
        viewModel.showWorktreeSheet()
    }

    override fun hideWorktreeSheet() {
        viewModel.hideWorktreeSheet()
    }

    override fun selectWorktree(path: String) {
        viewModel.selectWorktree(path)
    }

    override fun refresh() {
        viewModel.refresh()
    }

    override fun back() {
        onBack()
    }
}

internal class ChangesProbe(
    private val host: ChangesProbeHost,
) : ScreenProbe {

    override val name: String = "changes"

    override fun facts(): Map<String, String> = changesProbeFacts(host.state())

    override fun actions(): List<String> = listOf(
        "select_scope",
        "open_file",
        "open_worktree_sheet",
        "dismiss_worktree_sheet",
        "pick_worktree",
        "refresh",
        "back",
    )

    override fun settled(): Boolean = changesProbeSettled(host.state())

    override fun perform(action: String, args: Map<String, String>): Boolean = when (action) {
        "select_scope" -> selectScope(args["value"])
        "open_file" -> openFile(args["path"])
        "open_worktree_sheet" -> {
            host.showWorktreeSheet()
            true
        }
        "dismiss_worktree_sheet" -> {
            host.hideWorktreeSheet()
            true
        }
        "pick_worktree" -> pickWorktree(args["branch"])
        "refresh" -> {
            host.refresh()
            true
        }
        "back" -> {
            host.back()
            true
        }
        else -> false
    }

    private fun selectScope(value: String?): Boolean {
        val scope = when (value) {
            "uncommitted" -> GitScope.Uncommitted
            "branch" -> GitScope.Branch
            else -> return false
        }
        if (scope == GitScope.Branch && !host.state().branchScopeAvailable) {
            return false
        }
        host.selectScope(scope)
        return true
    }

    private fun openFile(path: String?): Boolean {
        if (path.isNullOrEmpty()) {
            return false
        }
        val file = host.state().files.firstOrNull { candidate -> candidate.path == path }
            ?: return false
        host.openFile(file)
        return true
    }

    private fun pickWorktree(branch: String?): Boolean {
        if (branch.isNullOrEmpty()) {
            return false
        }
        val worktree = host.state().worktrees
            .firstOrNull { candidate -> candidate.branch == branch }
            ?: return false
        host.selectWorktree(worktree.path)
        return true
    }
}

/** The tag on one file row inside the changes list. */
internal fun changesFileTag(path: String): String = "changes_file_$path"

/** The tag on one folder row inside the changes list. */
internal fun changesFolderTag(path: String): String = "changes_folder_$path"

/**
 * The tag on one row of the worktree sheet. Rows are addressed by branch, or by
 * the short head sha when a worktree is detached.
 */
internal fun changesWorktreeRowTag(branchOrSha: String): String = "changes_worktree_row_$branchOrSha"

/**
 * Flat strings only, derived from the one state the screen renders. Nothing
 * here reads a compose tree, so it is safe to call from the control-plane thread.
 */
internal fun changesProbeFacts(state: ChangesUiState): Map<String, String> {
    val files = state.files
    val inFlight = state.loading || state.refreshing
    val worktreeBranch = state.selectedWorktree?.branch
        ?: state.repository?.currentBranch
        ?: "detached"
    return mapOf(
        "scope" to if (state.scope == GitScope.Branch) "branch" else "uncommitted",
        "baseBranch" to state.baseBranchLabel,
        "uncommittedCount" to (state.uncommitted?.changes?.totals?.files ?: 0).toString(),
        "branchCount" to (state.branch?.changes?.totals?.files ?: 0).toString(),
        "fileCount" to files.size.toString(),
        "filePaths" to files.joinToString("|") { file -> file.path },
        "worktreeBranch" to worktreeBranch,
        "worktreeSheetOpen" to state.worktreeSheetVisible.toString(),
        "worktreeCount" to state.worktrees.size.toString(),
        "worktreeBranches" to state.worktrees.joinToString("|") { worktree ->
            worktree.branch ?: worktree.headSha
        },
        "loading" to inFlight.toString(),
        "empty" to (!inFlight && state.error == null && files.isEmpty()).toString(),
        "error" to state.error.orEmpty(),
    )
}

/**
 * The screen is settled when no load or refresh is in flight. A sheet that is
 * open is a stable screen, not pending work.
 */
internal fun changesProbeSettled(state: ChangesUiState): Boolean =
    !state.loading && !state.refreshing
