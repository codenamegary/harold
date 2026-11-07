package harold.android.transport.ssh

import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentRuntimeState
import harold.android.contracts.AgentRuntimeStatus
import harold.android.contracts.AgentSettings
import java.time.Instant
import kotlinx.serialization.Serializable

/**
 * One known ACP agent. [binaryName] is the host command a presence probe
 * looks up. Agents that only ship through a package runner have no stable
 * binary, so they are never auto-detected; the user points them at a real
 * path instead. [command] is the launch template: the binary plus the
 * arguments after it.
 */
data class KnownAgent(
    val id: AgentId,
    val displayName: String,
    val description: String? = null,
    val binaryName: String?,
    val command: List<String>,
    val popular: Boolean = false,
)

@Serializable
data class AgentScanEntry(
    val id: AgentId,
    val path: String?,
)

/**
 * The agents Harold knows how to launch. Catalog updates ship with app
 * releases; anything missing here can be added as a custom agent.
 */
val KNOWN_AGENTS: List<KnownAgent> = listOf(
    KnownAgent(
        id = "agoragentic-acp",
        displayName = "Agoragentic",
        description = "Agoragentic's ACP mode.",
        binaryName = null,
        command = listOf("npx", "-y", "agoragentic-mcp@1.3.0", "acp"),
    ),
    KnownAgent(
        id = "amp-acp",
        displayName = "Amp",
        description = "Sourcegraph Amp.",
        binaryName = "amp-acp",
        command = listOf("amp-acp"),
    ),
    KnownAgent(
        id = "auggie",
        displayName = "Auggie CLI",
        description = "Augment Code's CLI agent.",
        binaryName = "auggie",
        command = listOf("auggie", "acp"),
        popular = true,
    ),
    KnownAgent(
        id = "autohand",
        displayName = "Autohand Code",
        description = "Autohand's coding agent.",
        binaryName = null,
        command = listOf("npx", "-y", "@autohandai/autohand-acp@0.2.1"),
    ),
    KnownAgent(
        id = "claude-acp",
        displayName = "Claude Agent",
        description = "Claude Code through the ACP adapter.",
        binaryName = "claude",
        command = listOf("claude", "acp"),
        popular = true,
    ),
    KnownAgent(
        id = "cline",
        displayName = "Cline",
        description = "Cline's ACP mode.",
        binaryName = null,
        command = listOf("npx", "-y", "cline@3.0.51", "acp"),
    ),
    KnownAgent(
        id = "codebuddy-code",
        displayName = "Codebuddy Code",
        description = "Tencent's CodeBuddy.",
        binaryName = null,
        command = listOf("npx", "-y", "@tencent-ai/codebuddy-code@2.106.7", "acp"),
    ),
    KnownAgent(
        id = "codex-acp",
        displayName = "Codex",
        description = "OpenAI Codex through the ACP adapter.",
        binaryName = "codex-acp",
        command = listOf("codex-acp"),
        popular = true,
    ),
    KnownAgent(
        id = "cortex-code",
        displayName = "Cortex Code",
        description = "Tencent's Cortex Code.",
        binaryName = "cortex",
        command = listOf("cortex", "acp", "serve"),
    ),
    KnownAgent(
        id = "corust-agent",
        displayName = "Corust Agent",
        description = "Corust's ACP agent.",
        binaryName = "corust-agent-acp",
        command = listOf("corust-agent-acp"),
    ),
    KnownAgent(
        id = "crow-cli",
        displayName = "crow-cli",
        description = "crow-cli's ACP mode.",
        binaryName = "crow-cli",
        command = listOf("crow-cli", "acp"),
    ),
    KnownAgent(
        id = "cursor",
        displayName = "Cursor",
        description = "Cursor's CLI agent.",
        binaryName = "cursor-agent",
        command = listOf("cursor-agent", "acp"),
        popular = true,
    ),
    KnownAgent(
        id = "deepagents",
        displayName = "DeepAgents",
        description = "LangChain's DeepAgents.",
        binaryName = null,
        command = listOf("npx", "-y", "deepagents-acp@0.1.7"),
    ),
    KnownAgent(
        id = "devin",
        displayName = "Devin",
        description = "Cognition's Devin agent.",
        binaryName = "devin",
        command = listOf("devin", "acp"),
    ),
    KnownAgent(
        id = "dimcode",
        displayName = "DimCode",
        description = "DimCode's ACP mode.",
        binaryName = null,
        command = listOf("npx", "-y", "dimcode@0.3.7", "acp"),
    ),
    KnownAgent(
        id = "dirac",
        displayName = "Dirac",
        description = "Dirac's ACP mode.",
        binaryName = null,
        command = listOf("npx", "-y", "dirac-cli@0.4.34", "acp"),
    ),
    KnownAgent(
        id = "factory-droid",
        displayName = "Factory Droid",
        description = "Factory's Droid agent.",
        binaryName = "droid",
        command = listOf("droid", "exec", "acp-daemon"),
    ),
    KnownAgent(
        id = "fast-agent",
        displayName = "fast-agent",
        description = "Fast-agent's ACP mode.",
        binaryName = "fast-agent-acp",
        command = listOf("fast-agent-acp"),
    ),
    KnownAgent(
        id = "gemini",
        displayName = "Gemini CLI",
        description = "Google's Gemini CLI.",
        binaryName = "gemini",
        command = listOf("gemini", "acp"),
        popular = true,
    ),
    KnownAgent(
        id = "github-copilot-cli",
        displayName = "GitHub Copilot",
        description = "GitHub Copilot CLI.",
        binaryName = "copilot",
        command = listOf("copilot", "acp"),
        popular = true,
    ),
    KnownAgent(
        id = "glm-acp-agent",
        displayName = "GLM Agent",
        description = "Z.ai's GLM ACP agent.",
        binaryName = null,
        command = listOf("npx", "-y", "glm-acp-agent@1.3.0"),
    ),
    KnownAgent(
        id = "goose",
        displayName = "goose",
        description = "Block's goose agent.",
        binaryName = "goose",
        command = listOf("goose", "acp"),
        popular = true,
    ),
    KnownAgent(
        id = "grok-build",
        displayName = "Grok Build",
        description = "xAI's Grok coding agent.",
        binaryName = "grok",
        command = listOf("grok", "agent", "acp"),
    ),
    KnownAgent(
        id = "harn",
        displayName = "Harn",
        description = "Harn's ACP mode.",
        binaryName = "harn",
        command = listOf("harn", "serve", "acp"),
    ),
    KnownAgent(
        id = "junie",
        displayName = "Junie",
        description = "JetBrains' Junie agent.",
        binaryName = "junie",
        command = listOf("junie", "acp"),
    ),
    KnownAgent(
        id = "kilo",
        displayName = "Kilo",
        description = "Kilo Code's ACP mode.",
        binaryName = "kilo",
        command = listOf("kilo", "acp"),
        popular = true,
    ),
    KnownAgent(
        id = "kimi",
        displayName = "Kimi CLI",
        description = "Moonshot's Kimi CLI.",
        binaryName = "kimi",
        command = listOf("kimi", "acp"),
    ),
    KnownAgent(
        id = "minion-code",
        displayName = "Minion Code",
        description = "Minion's coding agent.",
        binaryName = null,
        command = listOf("uvx", "minion-code@0.1.44", "acp"),
    ),
    KnownAgent(
        id = "mistral-vibe",
        displayName = "Mistral Vibe",
        description = "Mistral's Vibe agent.",
        binaryName = "vibe-acp",
        command = listOf("vibe-acp"),
    ),
    KnownAgent(
        id = "nova",
        displayName = "Nova",
        description = "Compass AI's Nova agent.",
        binaryName = null,
        command = listOf("npx", "-y", "@compass-ai/nova@1.1.31", "acp"),
    ),
    KnownAgent(
        id = "opencode",
        displayName = "OpenCode",
        description = "OpenCode's ACP mode.",
        binaryName = "opencode",
        command = listOf("opencode", "acp"),
        popular = true,
    ),
    KnownAgent(
        id = "pi-acp",
        displayName = "pi ACP",
        description = "pi's ACP mode.",
        binaryName = null,
        command = listOf("npx", "-y", "pi-acp@0.0.33"),
        popular = true,
    ),
    KnownAgent(
        id = "poolside",
        displayName = "Poolside",
        description = "Poolside's ACP mode.",
        binaryName = "poolside",
        command = listOf("poolside", "acp"),
    ),
    KnownAgent(
        id = "qoder",
        displayName = "Qoder CLI",
        description = "Qoder's CLI agent.",
        binaryName = null,
        command = listOf("npx", "-y", "@qoder-ai/qodercli@0.2.14", "acp"),
    ),
    KnownAgent(
        id = "qwen-code",
        displayName = "Qwen Code",
        description = "Alibaba's Qwen coding agent.",
        binaryName = "qwen",
        command = listOf("qwen", "acp"),
    ),
    KnownAgent(
        id = "sigit",
        displayName = "siGit Code",
        description = "siGit's ACP mode.",
        binaryName = "sigit",
        command = listOf("sigit", "acp"),
    ),
    KnownAgent(
        id = "stakpak",
        displayName = "Stakpak",
        description = "Stakpak's ACP mode.",
        binaryName = "stakpak",
        command = listOf("stakpak", "acp"),
    ),
    KnownAgent(
        id = "vtcode",
        displayName = "VT Code",
        description = "VT Code's ACP mode.",
        binaryName = "vtcode",
        command = listOf("vtcode", "acp"),
    ),
)

fun knownAgent(id: AgentId): KnownAgent? = KNOWN_AGENTS.find { it.id == id }

/** Display name, falling back to the catalog name, then the raw id. */
fun agentDisplayName(id: AgentId, row: HostAgentConfigRow?): String =
    row?.displayName ?: knownAgent(id)?.displayName ?: id

/**
 * Builds the single shell probe used by a scan: for each known binary it
 * prints `id<TAB>path` when the binary is on PATH. One SSH round trip for
 * the whole catalog.
 */
fun presenceProbeScript(): String {
    val entries = KNOWN_AGENTS
        .filter { it.binaryName != null }
        .joinToString(" ") { agent ->
            val id = SshSessionStore.shellQuote(agent.id)
            val binary = SshSessionStore.shellQuote(agent.binaryName!!)
            "$id:$binary"
        }
    return buildString {
        append("for pair in ")
        append(entries)
        append("; do id=${'$'}{pair%%:*}; c=${'$'}{pair#*:}; ")
        append("p=${'$'}(command -v \"${'$'}c\" 2>/dev/null || true); ")
        append("if [ -n \"${'$'}p\" ]; then printf '%s\\t%s\\n' \"${'$'}id\" \"${'$'}p\"; fi; done")
    }
}

fun parsePresenceProbe(stdout: String): List<AgentScanEntry> =
    stdout.lineSequence()
        .filter { line -> line.contains('\t') }
        .mapNotNull { line ->
            val (id, path) = line.split('\t', limit = 2)
            if (id.isBlank() || path.isBlank()) null else AgentScanEntry(id, path)
        }
        .toList()

/**
 * Merge rule for a scan: detection adds rows for agents it just found and
 * fills a missing path on an existing row, but never touches user-owned
 * fields (`enabled`, `args`, `displayName`, `dismissed`, `custom`). Custom
 * agents keep whatever the user configured, including their path.
 */
fun mergeScanRows(
    existing: List<HostAgentConfigRow>,
    scan: List<AgentScanEntry>,
    now: String = Instant.now().toString(),
): List<HostAgentConfigRow> {
    val rows = existing.toMutableList()
    scan.forEach { entry ->
        val index = rows.indexOfFirst { it.id == entry.id }
        when {
            index < 0 -> rows += HostAgentConfigRow(
                id = entry.id,
                path = entry.path,
                args = knownAgent(entry.id)?.command?.drop(1).orEmpty(),
                enabled = true,
                present = true,
                updatedAt = now,
            )

            else -> {
                val row = rows[index]
                rows[index] = row.copy(
                    path = row.path ?: entry.path,
                    present = true,
                    updatedAt = now,
                )
            }
        }
    }
    // Agents the probe did not find lose their "present" flag, unless the
    // user pointed them at an explicit path.
    return rows.map { row ->
        val found = scan.any { it.id == row.id }
        if (found || row.path != null) {
            row
        } else {
            row.copy(present = false, updatedAt = now)
        }
    }
}

/**
 * The visible agent list: every known agent plus custom rows, sorted
 * enabled first, then present, then popular, then by name.
 */
fun agentSettingsView(
    rows: List<HostAgentConfigRow>,
    authOf: (AgentId) -> AgentAuthSummary = {
        AgentAuthSummary(status = harold.android.contracts.AgentAuthStatus.Unknown, error = null, activeSessionId = null, canLogout = false)
    },
): List<AgentSettings> {
    val rowsById = rows.associateBy { it.id }
    val knownViews = KNOWN_AGENTS.map { agent ->
        val row = rowsById[agent.id]
        viewFor(
            id = agent.id,
            row = row,
            displayName = agentDisplayName(agent.id, row),
            args = row?.args ?: agent.command.drop(1),
            templatePath = agent.binaryName,
            popular = agent.popular,
            deletable = false,
            authOf = authOf,
        )
    }
    val customViews = rows
        .filter { it.custom }
        .map { row ->
            viewFor(
                id = row.id,
                row = row,
                displayName = row.displayName ?: row.id,
                args = row.args,
                templatePath = null,
                popular = false,
                deletable = true,
                authOf = authOf,
            )
        }
    return (customViews + knownViews).sortedWith(
        compareBy(
            { !it.enabled },
            { !it.present },
            { !it.popular },
            { it.displayName.lowercase() },
        ),
    )
}

private fun viewFor(
    id: AgentId,
    row: HostAgentConfigRow?,
    displayName: String,
    args: List<String>,
    templatePath: String?,
    popular: Boolean,
    deletable: Boolean,
    authOf: (AgentId) -> AgentAuthSummary,
): AgentSettings {
    val dismissed = row?.dismissed == true
    // A detected binary or a user-entered path both mean the agent can launch.
    val present = row?.present == true || row?.path != null
    return AgentSettings(
        id = id,
        displayName = displayName,
        available = !dismissed && (present || row?.path != null || templatePath != null),
        enabled = row?.enabled == true && !dismissed,
        path = row?.path,
        args = args,
        present = present,
        popular = popular,
        deletable = deletable,
        dismissed = dismissed,
        state = AgentRuntimeState(AgentRuntimeStatus.Stopped),
        capabilities = null,
        authSummary = authOf(id),
    )
}

/** Custom agent ids are `custom-<slug>`, with `-2`, `-3`… suffixes on collision. */
fun allocateCustomAgentId(name: String, existing: List<HostAgentConfigRow>): String {
    val slug = name.lowercase()
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
        .ifBlank { "agent" }
    val base = "custom-$slug"
    val taken = existing.map { it.id }.toSet()
    if (base !in taken) {
        return base
    }
    var n = 2
    while ("$base-$n" in taken) {
        n += 1
    }
    return "$base-$n"
}

/** "Custom Agent", then "Custom Agent 1", "Custom Agent 2"… */
fun allocateCustomDisplayName(existing: List<HostAgentConfigRow>): String {
    val taken = existing.mapNotNull { it.displayName }.toSet()
    val base = "Custom Agent"
    if (base !in taken) {
        return base
    }
    var n = 1
    while ("$base $n" in taken) {
        n += 1
    }
    return "$base $n"
}
