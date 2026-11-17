package harold.android.connections

import harold.android.contracts.AgentLogs
import harold.android.contracts.HostLogs
import harold.android.contracts.LogRun
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The app warns at this total size. The host never deletes on its own. */
internal const val HOST_LOGS_WARNING_BYTES: Long = 512L * 1024 * 1024

private const val KIB = 1024L
private const val MIB = KIB * 1024
private const val GIB = MIB * 1024

private val RUN_TIME = DateTimeFormatter
    .ofPattern("yyyy-MM-dd HH:mm 'UTC'")
    .withZone(ZoneOffset.UTC)

internal data class LogCleanupPreview(
    val runs: Int,
    val bytes: Long,
)

internal enum class LogRunRole {
    Current,
    Latest,
    Past,
}

internal fun hostLogsWarning(totalBytes: Long): Boolean = totalBytes > HOST_LOGS_WARNING_BYTES

/**
 * Mirrors the host's all-inactive policy so the confirmation can state the
 * exact number of runs and bytes before anything is deleted. The active run
 * and the newest run of each agent are protected.
 */
internal fun hostLogCleanupPreview(logs: HostLogs?): LogCleanupPreview {
    if (logs == null) {
        return LogCleanupPreview(runs = 0, bytes = 0)
    }
    var runs = 0
    var bytes = 0L
    logs.agents.forEach { agent ->
        val newestId = agent.runs.maxOfOrNull { run -> run.id }
        agent.runs.forEach { run ->
            if (run.active || run.id == newestId) {
                return@forEach
            }
            runs += 1
            bytes += run.bytes
        }
    }
    return LogCleanupPreview(runs = runs, bytes = bytes)
}

/** Largest agent first so the section opens with where the space went. */
internal fun sortedAgentLogs(logs: HostLogs): List<AgentLogs> = logs.agents.sortedWith(
    compareByDescending<AgentLogs> { agent -> agent.totalBytes }
        .thenBy { agent -> agent.displayName ?: agent.agentId },
)

/** Newest run first; run ids sort by start time. */
internal fun sortedLogRuns(agent: AgentLogs): List<LogRun> =
    agent.runs.sortedByDescending { run -> run.id }

internal fun logRunRole(run: LogRun, hostRunning: Boolean): LogRunRole = when {
    run.active && hostRunning -> LogRunRole.Current
    run.active -> LogRunRole.Latest
    else -> LogRunRole.Past
}

internal fun formatLogBytes(bytes: Long): String = when {
    bytes >= GIB -> formatLogUnit(bytes.toDouble() / GIB, "GB")
    bytes >= MIB -> formatLogUnit(bytes.toDouble() / MIB, "MB")
    bytes >= KIB -> formatLogUnit(bytes.toDouble() / KIB, "KB")
    else -> "$bytes B"
}

private fun formatLogUnit(value: Double, unit: String): String {
    val pattern = if (value >= 10) "%.0f" else "%.1f"
    val number = String.format(Locale.US, pattern, value).removeSuffix(".0")
    return "$number $unit"
}

internal fun formatRunStartedAt(startedAt: Instant?): String =
    startedAt?.let(RUN_TIME::format) ?: "Unknown start"
