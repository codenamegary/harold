package harold.android.contracts

import java.time.Instant

/**
 * Host agent logs, one directory per host process. A run is the unit of
 * deletion: removing a run removes its whole directory.
 */
data class HostLogs(
    val agents: List<AgentLogs>,
    val fetchedAt: Instant,
) {
    val totalBytes: Long
        get() = agents.sumOf { agent -> agent.totalBytes }
}

data class AgentLogs(
    val agentId: String,
    val displayName: String?,
    val hostRunning: Boolean,
    val activeRunId: String?,
    val runs: List<LogRun>,
) {
    val totalBytes: Long
        get() = runs.sumOf { run -> run.bytes }
}

data class LogRun(
    val id: String,
    val startedAt: Instant?,
    val outBytes: Long,
    val errBytes: Long,
    val active: Boolean,
) {
    val bytes: Long
        get() = outBytes + errBytes
}

/** Cleanup policies the host script understands. */
enum class LogCleanupPolicy(val wireValue: String) {
    /** Delete every inactive run, keeping the active and newest run per agent. */
    AllInactive("all-inactive"),
}

data class LogCleanupResult(
    val deletedRuns: Int,
    val removedBytes: Long,
)
