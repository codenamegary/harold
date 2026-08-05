package server.agent.android.shell

import server.agent.android.session.PairedState

data class ShellUiState(
    val title: String = "Agent Server",
    val status: String = "Not paired",
    val pairEnabled: Boolean = true,
    val pairLabel: String = "Pair",
)

fun ShellUiState.fromPairedState(pairedState: PairedState): ShellUiState =
    when (pairedState) {
        PairedState.NotPaired -> copy(
            status = "Not paired",
            pairEnabled = true,
            pairLabel = "Pair",
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
