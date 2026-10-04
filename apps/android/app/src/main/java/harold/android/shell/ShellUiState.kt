package harold.android.shell

import harold.android.stream.ConnectionState
import harold.android.stream.ConnectionStatus
import harold.android.session.PairedState

sealed interface WorkspaceProbe {
    data object Loading : WorkspaceProbe

    data class Loaded(
        val count: Int,
    ) : WorkspaceProbe

    /** The credential was rejected on HTTP. Same operator choice as a rejected socket. */
    data class Unauthorized(
        val detail: String?,
    ) : WorkspaceProbe

    data class Failed(
        val message: String,
    ) : WorkspaceProbe
}

data class ShellUiState(
    val title: String = "Harold",
    val status: String = "Not paired",
    val pairEnabled: Boolean = true,
    val pairLabel: String = "Pair",
    val connectionStatus: String? = null,
    val workspacesSummary: String? = null,
    val streamStalled: Boolean = false,
    val probeUnauthorized: Boolean = false,
) {
    /** Either transport can stop on its own, and either one needs the same escape hatch. */
    val retryVisible: Boolean get() = streamStalled || probeUnauthorized
}

fun ShellUiState.fromPairedState(pairedState: PairedState): ShellUiState =
    when (pairedState) {
        PairedState.NotPaired -> copy(
            status = "Not paired",
            pairEnabled = true,
            pairLabel = "Pair",
            connectionStatus = null,
            workspacesSummary = null,
            streamStalled = false,
            probeUnauthorized = false,
        )

        is PairedState.Paired -> copy(
            status = buildString {
                append("Paired to ")
                append(pairedState.serverOrigin)
                pairedState.deviceName?.let { name ->
                    append("\n")
                    append(name)
                }
            },
            pairEnabled = true,
            pairLabel = "Re-pair",
        )
    }

fun ShellUiState.fromConnectionState(state: ConnectionState): ShellUiState =
    copy(
        connectionStatus = state.status.label(),
        streamStalled = state.status.hasStoppedRetrying(),
    )

fun ShellUiState.fromWorkspaceProbe(probe: WorkspaceProbe): ShellUiState =
    copy(
        workspacesSummary = probe.summary(),
        probeUnauthorized = probe is WorkspaceProbe.Unauthorized,
    )

private fun ConnectionStatus.label(): String? =
    when (this) {
        ConnectionStatus.Idle -> null
        ConnectionStatus.Connecting -> "Connecting"
        ConnectionStatus.Live -> "Live"
        is ConnectionStatus.Reconnecting -> "Reconnecting (attempt $attempt)"
        is ConnectionStatus.AuthFailed -> detail?.let { "Auth failed. $it" } ?: "Auth failed"
        is ConnectionStatus.TransportError -> "Transport error. $message"
    }

private fun ConnectionStatus.hasStoppedRetrying(): Boolean =
    this is ConnectionStatus.AuthFailed || this is ConnectionStatus.TransportError

private fun WorkspaceProbe.summary(): String =
    when (this) {
        WorkspaceProbe.Loading -> "Checking workspaces"
        is WorkspaceProbe.Loaded -> when (count) {
            0 -> "No workspaces"
            1 -> "1 workspace"
            else -> "$count workspaces"
        }

        is WorkspaceProbe.Unauthorized ->
            "Workspaces unavailable. ${detail ?: "Not authorized"}"

        is WorkspaceProbe.Failed -> "Workspaces unavailable. $message"
    }
