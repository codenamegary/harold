package harold.android.host

import harold.android.contracts.AgentLogs
import harold.android.contracts.HostLogs
import harold.android.contracts.LogCleanupResult
import harold.android.contracts.LogRun
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset

private val RUN_START = Regex("""^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-(\d+)$""")

/** Parses `20261117T142530Z-12345` into the instant the host started. */
internal fun parseRunStartedAt(runId: String): Instant? {
    val match = RUN_START.matchEntire(runId) ?: return null
    val parts = match.destructured
    return runCatching {
        LocalDateTime.of(
            parts.component1().toInt(),
            parts.component2().toInt(),
            parts.component3().toInt(),
            parts.component4().toInt(),
            parts.component5().toInt(),
            parts.component6().toInt(),
        ).toInstant(ZoneOffset.UTC)
    }.getOrNull()
}

/**
 * Reads the `logs` mode output:
 * `run<TAB><agent><TAB><run-id><TAB><out-bytes><TAB><err-bytes><TAB><active><TAB><running>`
 * Unknown lines and malformed runs are ignored so a newer host can add
 * columns without breaking an older app.
 */
internal fun parseHostLogs(
    output: String,
    fetchedAt: Instant,
    displayNames: Map<String, String?> = emptyMap(),
): HostLogs {
    val agents = LinkedHashMap<String, MutableAgentLogs>()
    for (line in output.lineSequence()) {
        val fields = line.split('\t')
        if (fields.size < 7 || fields[0] != "run") {
            continue
        }
        val agentId = fields[1].takeIf { value -> value.isNotBlank() } ?: continue
        val runId = fields[2]
        val startedAt = parseRunStartedAt(runId) ?: continue
        val outBytes = fields[3].toLongOrNull() ?: continue
        val errBytes = fields[4].toLongOrNull() ?: continue
        val active = fields[5] == "1"
        val running = fields[6] == "1"

        val agent = agents.getOrPut(agentId) { MutableAgentLogs() }
        agent.hostRunning = agent.hostRunning || running
        if (active && agent.activeRunId == null) {
            agent.activeRunId = runId
        }
        agent.runs += LogRun(
            id = runId,
            startedAt = startedAt,
            outBytes = outBytes,
            errBytes = errBytes,
            active = active,
        )
    }

    return HostLogs(
        agents = agents.map { (agentId, agent) ->
            AgentLogs(
                agentId = agentId,
                displayName = displayNames[agentId]?.takeIf { name -> name.isNotBlank() },
                hostRunning = agent.hostRunning,
                activeRunId = agent.activeRunId,
                runs = agent.runs,
            )
        },
        fetchedAt = fetchedAt,
    )
}

/** Reads the `cleanup` mode output, `cleanup<TAB><runs><TAB><bytes>`. */
internal fun parseLogCleanupResult(output: String): LogCleanupResult? {
    for (line in output.lineSequence()) {
        val fields = line.split('\t')
        if (fields.size < 3 || fields[0] != "cleanup") {
            continue
        }
        val deletedRuns = fields[1].toIntOrNull() ?: continue
        val removedBytes = fields[2].toLongOrNull() ?: continue
        return LogCleanupResult(deletedRuns = deletedRuns, removedBytes = removedBytes)
    }
    return null
}

private class MutableAgentLogs {
    var hostRunning: Boolean = false
    var activeRunId: String? = null
    val runs = mutableListOf<LogRun>()
}
