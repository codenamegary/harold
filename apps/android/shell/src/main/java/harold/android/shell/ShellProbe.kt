package harold.android.shell

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import harold.android.ui.debug.Probe
import harold.android.ui.debug.ScreenProbe

/**
 * Debug control plane adapter for the empty home.
 *
 * This file is compiled into every build because [ShellScreen] and this probe
 * share a module, but it does nothing unless the debug build's initializer sets
 * [Probe.enabled]. Release builds install no probe, so the registry stays empty.
 */
@Composable
fun ShellProbeEffect(
    viewModel: ShellViewModel,
) {
    DisposableEffect(viewModel) {
        if (!Probe.enabled) {
            return@DisposableEffect onDispose {}
        }
        val probe = ShellProbe(ShellViewModelProbeHost(viewModel))
        Probe.install(probe)
        onDispose { Probe.uninstall(probe) }
    }
}

internal interface ShellProbeHost {
    fun state(): ShellUiState

    fun addConnection()

    fun retry()
}

internal class ShellProbe(
    private val host: ShellProbeHost,
) : ScreenProbe {

    override val name: String = "shell"

    override fun facts(): Map<String, String> = shellProbeFacts(host.state())

    override fun actions(): List<String> = shellProbeActions()

    override fun settled(): Boolean = true

    override fun perform(action: String, args: Map<String, String>): Boolean = when (action) {
        "add_connection" -> {
            host.addConnection()
            true
        }
        "retry" -> {
            host.retry()
            true
        }
        else -> false
    }
}

internal fun shellProbeFacts(state: ShellUiState): Map<String, String> = mapOf(
    "status" to state.status,
    "addConnectionLabel" to state.addConnectionLabel,
    "addConnectionEnabled" to state.addConnectionEnabled.toString(),
    "retryVisible" to state.retryVisible.toString(),
    "connectionStatus" to state.connectionStatus.orEmpty(),
)

internal fun shellProbeActions(): List<String> = listOf("add_connection", "retry")

internal class ShellViewModelProbeHost(
    private val viewModel: ShellViewModel,
) : ShellProbeHost {
    override fun state(): ShellUiState = viewModel.uiState.value

    override fun addConnection() = viewModel.onAddConnectionClick()

    override fun retry() = viewModel.onRetryClick()
}
