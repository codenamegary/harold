package harold.android.process

/** An ACP agent process to launch on the host. */
data class AgentLaunchSpec(val command: String, val label: String, val cwd: String? = null)

/** A terminal command requested by an ACP agent. */
data class TerminalLaunchSpec(
    val command: String,
    val args: List<String>,
    val cwd: String? = null,
    val env: Map<String, String> = emptyMap(),
)

/** One agent the host has enabled and detected. */
data class LaunchableAgent(val id: String, val displayName: String)
