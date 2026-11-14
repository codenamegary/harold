package harold.android.changes

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import harold.android.contracts.GitScope
import harold.android.ui.debug.Probe
import harold.android.ui.debug.ScreenProbe

/**
 * Debug control plane adapter for the single-file diff view.
 *
 * This file is compiled into every build because [FileDiffScreen] and this probe
 * share a module, but it does nothing unless the debug build's initializer sets
 * [Probe.enabled]. Release builds install no probe, so the registry stays empty.
 */
@Composable
fun FileDiffProbeEffect(
    viewModel: FileDiffViewModel,
    onBack: () -> Unit = {},
) {
    DisposableEffect(viewModel) {
        if (!Probe.enabled) {
            return@DisposableEffect onDispose {}
        }
        val probe = FileDiffProbe(
            FileDiffViewModelProbeHost(
                viewModel = viewModel,
                onBack = onBack,
            ),
        )
        Probe.install(probe)
        onDispose { Probe.uninstall(probe) }
    }
}

/**
 * Everything the probe needs from the view, behind one narrow port so the
 * probe's dispatch can be tested without a Hilt graph or a compose runtime.
 */
internal interface FileDiffProbeHost {
    fun state(): FileDiffUiState

    fun reload()

    fun back()
}

internal class FileDiffViewModelProbeHost(
    private val viewModel: FileDiffViewModel,
    private val onBack: () -> Unit,
) : FileDiffProbeHost {
    override fun state(): FileDiffUiState = viewModel.uiState.value

    override fun reload() {
        viewModel.retry()
    }

    override fun back() {
        onBack()
    }
}

internal class FileDiffProbe(
    private val host: FileDiffProbeHost,
) : ScreenProbe {

    override val name: String = "file_diff"

    override fun facts(): Map<String, String> = fileDiffProbeFacts(host.state())

    override fun actions(): List<String> = listOf(
        "back",
        "reload",
    )

    override fun settled(): Boolean = fileDiffProbeSettled(host.state())

    override fun perform(action: String, args: Map<String, String>): Boolean = when (action) {
        "back" -> {
            host.back()
            true
        }
        "reload" -> {
            host.reload()
            true
        }
        else -> false
    }
}

/**
 * Flat strings only, derived from the one state the screen renders. `lineCount`
 * is what the driver waits on to know the diff has painted, and `path` is the
 * file the screen is showing.
 */
internal fun fileDiffProbeFacts(state: FileDiffUiState): Map<String, String> {
    val diff = state.diff
    val hunks = diff?.hunks.orEmpty()
    return mapOf(
        "path" to (diff?.path ?: state.filePath),
        "scope" to if (state.scope == GitScope.Branch) "branch" else "uncommitted",
        "hunkCount" to hunks.size.toString(),
        "lineCount" to hunks.sumOf { hunk -> hunk.lines.size }.toString(),
        "truncated" to (diff?.truncated ?: false).toString(),
        "loading" to state.loading.toString(),
        "error" to state.error.orEmpty(),
    )
}

/** True only while the diff request is in flight. */
internal fun fileDiffProbeSettled(state: FileDiffUiState): Boolean = !state.loading
