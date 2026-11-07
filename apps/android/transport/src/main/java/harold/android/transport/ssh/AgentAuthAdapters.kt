package harold.android.transport.ssh

import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject

/** The result of one auth probe on the host. */
data class AgentAuthProbe(
    val status: AgentAuthStatus,
    val error: String?,
    val canLogout: Boolean,
) {
    fun summary(): AgentAuthSummary = AgentAuthSummary(
        status = status,
        error = error,
        activeSessionId = null,
        canLogout = canLogout,
    )
}

private val authJson = Json { ignoreUnknownKeys = true }

/**
 * One agent CLI's sign-in probe: a status command, a parser for its JSON
 * output, and the matching logout command.
 */
class AgentAuthAdapter(
    val id: String,
    val agentIds: Set<AgentId>,
    val probeCommand: String,
    /** The command may exit non-zero and still print usable status JSON. */
    private val acceptsFailureOutput: Boolean,
    val logoutCommand: String,
    private val parse: (stdout: String) -> AgentAuthProbe,
) {
    /**
     * Maps a probe run to a status. A failed run with usable stdout is still
     * parsed; a run with nothing to parse degrades to unknown.
     */
    fun probeResult(result: SshCommandResult): AgentAuthProbe {
        if (result.succeeded || acceptsFailureOutput) {
            val trimmed = result.stdout.trim()
            if (trimmed.isNotEmpty()) {
                return runCatching { parse(trimmed) }.getOrDefault(
                    AgentAuthProbe(AgentAuthStatus.Unknown, null, canLogout = false),
                )
            }
        }
        return AgentAuthProbe(
            status = AgentAuthStatus.Unknown,
            error = result.stderr.trim().ifBlank { null },
            canLogout = false,
        )
    }
}

private val adapters: Map<AgentId, AgentAuthAdapter> = listOf(
    AgentAuthAdapter(
        id = "claude",
        agentIds = setOf("claude-acp"),
        probeCommand = "claude auth status --json",
        acceptsFailureOutput = true,
        logoutCommand = "claude auth logout",
        parse = ::parseClaude,
    ),
    AgentAuthAdapter(
        id = "cursor",
        agentIds = setOf("cursor"),
        probeCommand = "cursor-agent status --format json",
        acceptsFailureOutput = false,
        logoutCommand = "cursor-agent logout",
        parse = ::parseCursor,
    ),
).associateBy { it.id }

/**
 * Per-agent auth probes against the host's agent CLIs. Probing is advisory:
 * any failure degrades to [AgentAuthStatus.Unknown] and nothing gates on the
 * result. Sign-in itself always happens on the host — the app only reports
 * what it sees, never runs a login flow.
 */
object AgentAuthAdapters {
    /** Agents whose CLI can report (and clear) its own sign-in state. */
    val knownAgentIds: Set<AgentId> = adapters.values.flatMap { it.agentIds }.toSet()

    /** First adapter whose agent ids match wins; everything else probes to unknown. */
    fun resolve(agentId: AgentId): AgentAuthAdapter? =
        adapters.values.find { agentId in it.agentIds }
}

private fun parseClaude(stdout: String): AgentAuthProbe {
    val obj = parseStatusObject(stdout)
        ?: return unknownProbe("The claude CLI did not report a status.")
    val error = obj.string("error")
    if (!error.isNullOrBlank()) {
        return AgentAuthProbe(AgentAuthStatus.Error, error, canLogout = true)
    }
    return when (obj.boolean("loggedIn")) {
        true -> AgentAuthProbe(AgentAuthStatus.Authenticated, null, canLogout = true)
        false -> AgentAuthProbe(AgentAuthStatus.NeedsAuth, null, canLogout = false)
        null -> unknownProbe("The claude CLI did not report a sign-in state.")
    }
}

private fun parseCursor(stdout: String): AgentAuthProbe {
    val obj = parseStatusObject(stdout)
        ?: return unknownProbe("The cursor-agent CLI did not report a status.")
    val authenticated = obj.boolean("isAuthenticated") == true ||
        obj.string("status") == "authenticated"
    val error = obj.string("error")
    return when {
        !error.isNullOrBlank() -> AgentAuthProbe(AgentAuthStatus.Error, error, canLogout = true)
        authenticated -> AgentAuthProbe(AgentAuthStatus.Authenticated, null, canLogout = true)
        else -> AgentAuthProbe(AgentAuthStatus.NeedsAuth, null, canLogout = false)
    }
}

private fun parseStatusObject(stdout: String): JsonObject? {
    val start = stdout.indexOf('{')
    if (start < 0) {
        return null
    }
    return runCatching { authJson.parseToJsonElement(stdout.substring(start)).jsonObject }.getOrNull()
}

private fun unknownProbe(message: String) =
    AgentAuthProbe(AgentAuthStatus.Unknown, message, canLogout = false)

private fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.content

private fun JsonObject.boolean(key: String): Boolean? =
    (this[key] as? JsonPrimitive)?.booleanOrNull

/** Tells the chat UI what to tell the user when an agent needs a host sign-in. */
fun hostLoginInstructions(agentId: AgentId): String {
    val command = when (agentId) {
        "claude-acp" -> "claude"
        "cursor" -> "cursor-agent"
        else -> knownAgent(agentId)?.displayName ?: agentId
    }
    return "Sign in as $command on the host (run it once in a terminal there), " +
        "then restart the agent from this screen."
}

/** True when an ACP error reports that the agent needs a host-side sign-in. */
fun isAcpAuthRequiredError(code: Int?, message: String?): Boolean {
    if (code == AUTH_REQUIRED_CODE) {
        return true
    }
    val normalized = message?.lowercase()?.replace('_', ' ') ?: return false
    return "auth required" in normalized || "authentication required" in normalized
}

const val AUTH_REQUIRED_CODE = -32000

/** In-memory TTL cache for auth probes, keyed by connection and agent. */
class AgentAuthCache(ttl: Duration = DEFAULT_TTL) {
    private data class Entry(val probe: AgentAuthProbe, val at: Instant)

    private val ttl = ttl
    private val entries = HashMap<String, Entry>()

    @Synchronized
    fun get(connectionId: String, agentId: AgentId, now: Instant = Instant.now()): AgentAuthProbe? {
        val entry = entries[key(connectionId, agentId)] ?: return null
        if (Duration.between(entry.at, now) > ttl) {
            entries.remove(key(connectionId, agentId))
            return null
        }
        return entry.probe
    }

    @Synchronized
    fun put(connectionId: String, agentId: AgentId, probe: AgentAuthProbe) {
        entries[key(connectionId, agentId)] = Entry(probe, Instant.now())
    }

    @Synchronized
    fun invalidate(connectionId: String, agentId: AgentId) {
        entries.remove(key(connectionId, agentId))
    }

    @Synchronized
    fun clear() {
        entries.clear()
    }

    private fun key(connectionId: String, agentId: AgentId): String = "$connectionId|$agentId"

    companion object {
        val DEFAULT_TTL: Duration = Duration.ofSeconds(30)
    }
}
