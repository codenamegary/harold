package harold.android.host

import harold.android.contracts.SessionUsage
import harold.android.contracts.UsageCost
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Reads the `usage` mode output:
 * `usage<TAB><agent><TAB><run><TAB><offset><TAB><json>`
 * `end<TAB><agent><TAB><run><TAB><safe-offset>`
 * `done<TAB><agent>` after a full scan.
 *
 * The newest run and its safe offset let the next refresh read only the bytes
 * the previous scan did not cover.
 */
internal fun parseHostUsage(output: String): HostUsageScan {
    val samples = mutableListOf<UsageSample>()
    val ends = linkedMapOf<String, Long>()
    var complete = false

    for (line in output.lineSequence()) {
        val fields = line.split('\t', limit = 5)
        when {
            fields.size >= 5 && fields[0] == "usage" -> {
                val sample = parseUsageSample(
                    agentId = fields[1],
                    runId = fields[2],
                    offset = fields[3].toLongOrNull() ?: continue,
                    json = fields[4],
                ) ?: continue
                samples += sample
            }

            fields.size >= 4 && fields[0] == "end" -> {
                val offset = fields[3].toLongOrNull() ?: continue
                if (fields[2].isNotBlank() && offset >= 0) {
                    ends[fields[2]] = offset
                }
            }

            fields.size >= 1 && fields[0] == "done" -> complete = true
        }
    }

    return HostUsageScan(
        sessions = foldLatest(samples),
        ends = ends,
        complete = complete,
    )
}

internal data class HostUsageScan(
    val sessions: List<SessionUsage>,
    val ends: Map<String, Long>,
    val complete: Boolean,
) {
    val newestRunId: String?
        get() = ends.keys.maxOrNull()

    val newestRunOffset: Long?
        get() = newestRunId?.let { runId -> ends[runId] }
}

private data class UsageSample(
    val agentId: String,
    val sessionId: String,
    val runId: String,
    val offset: Long,
    val used: Long,
    val size: Long,
    val cost: UsageCost?,
)

private fun parseUsageSample(
    agentId: String,
    runId: String,
    offset: Long,
    json: String,
): UsageSample? {
    if (agentId.isBlank() || runId.isBlank() || offset < 0) {
        return null
    }
    val root = runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull()
        ?: return null
    if (root.string("method") != "session/update") {
        return null
    }
    val params = root["params"] as? JsonObject ?: return null
    val sessionId = params.string("sessionId")?.takeIf { it.isNotBlank() } ?: return null
    val update = params["update"] as? JsonObject ?: return null
    if (update.string("sessionUpdate") != "usage_update") {
        return null
    }
    val used = update.number("used")?.toLong() ?: return null
    val size = update.number("size")?.toLong() ?: return null
    if (used < 0 || size < 0) {
        return null
    }
    return UsageSample(
        agentId = agentId,
        sessionId = sessionId,
        runId = runId,
        offset = offset,
        used = used,
        size = size,
        cost = readUsageCost(update),
    )
}

private fun foldLatest(samples: List<UsageSample>): List<SessionUsage> {
    val ordered = samples.sortedWith(compareBy({ it.runId }, { it.offset }))
    val bySession = linkedMapOf<String, SessionUsage>()
    for (sample in ordered) {
        val key = "${sample.agentId}\u0000${sample.sessionId}"
        val previous = bySession[key]
        bySession[key] = SessionUsage(
            agentId = sample.agentId,
            sessionId = sample.sessionId,
            used = sample.used,
            size = sample.size,
            cost = sample.cost ?: previous?.cost,
            lastRunId = sample.runId,
            lastOffset = sample.offset,
            updatedAt = parseRunStartedAt(sample.runId),
        )
    }
    return bySession.values.toList()
}

private fun readUsageCost(update: JsonObject): UsageCost? {
    val cost = update["cost"] as? JsonObject ?: return null
    val amount = cost.number("amount") ?: return null
    val currency = cost.string("currency")?.takeIf { it.isNotBlank() } ?: return null
    return UsageCost(amount = amount, currency = currency)
}

private fun JsonObject.number(key: String): Double? =
    string(key)?.toDoubleOrNull()

private fun JsonObject.string(key: String): String? {
    val value = this[key] as? JsonPrimitive ?: return null
    return value.contentOrNull
}
