package harold.android.host

import harold.android.transport.ssh.SshConnection
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class HostWorkspace(
    val id: String,
    val name: String,
    val path: String,
    val createdAt: String,
    val lastUsedAt: String,
)

/**
 * One row of the host's shared agent config, `~/.harold/agents.json`. The
 * user-owned fields ([enabled], [path], [args], [dismissed]) survive a rescan;
 * detection only fills gaps and adds new rows. Custom agents ([custom]) are
 * plain rows that can be deleted outright.
 */
@Serializable
data class HostAgentConfigRow(
    val id: String,
    val displayName: String? = null,
    val path: String? = null,
    val args: List<String> = emptyList(),
    val enabled: Boolean = true,
    val dismissed: Boolean = false,
    val custom: Boolean = false,
    val present: Boolean = false,
    val updatedAt: String,
)

/**
 * Host state under `~/.harold`: agent config, remembered workspaces, and
 * uploads grouped by session id. Session history stays with the agent and is
 * read through ACP `session/list`; the app never mirrors it to the host.
 * There is no daemon and no shared index.
 */
class SshSessionStore(
    private val connection: SshConnection,
    val home: String,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        prettyPrint = true
    }

    val baseDir: String get() = "$home/.harold"
    val uploadsDir: String get() = "$baseDir/uploads"

    suspend fun workspaces(): List<HostWorkspace> {
        val bytes = runCatching { connection.readFile(workspacesPath()) }.getOrNull()
            ?: return emptyList()
        return runCatching {
            json.decodeFromString<List<HostWorkspace>>(bytes.toString(Charsets.UTF_8))
        }.getOrDefault(emptyList())
    }

    suspend fun rememberWorkspace(path: String, name: String): HostWorkspace {
        val now = Instant.now().toString()
        val existing = workspaces()
        val found = existing.find { workspace -> workspace.path == path }
        if (found != null) {
            return found
        }
        val workspace = HostWorkspace(
            id = stableId(path),
            name = name,
            path = path,
            createdAt = now,
            lastUsedAt = now,
        )
        writeWorkspaces(existing + workspace)
        return workspace
    }

    suspend fun forgetWorkspace(path: String) {
        writeWorkspaces(workspaces().filterNot { workspace -> workspace.path == path })
    }

    fun agentsConfigPath(): String = "$baseDir/agents.json"

    /** Null when the host has no agents.json yet (before the first scan). */
    suspend fun readAgentsConfig(): List<HostAgentConfigRow>? {
        val bytes = runCatching { connection.readFile(agentsConfigPath()) }.getOrNull()
            ?: return null
        return runCatching {
            json.decodeFromString<List<HostAgentConfigRow>>(bytes.toString(Charsets.UTF_8))
        }.getOrNull()
    }

    suspend fun agentsConfig(): List<HostAgentConfigRow> = readAgentsConfig().orEmpty()

    /**
     * Writes agents.json through a temp file plus rename, so a reader on
     * another device never sees a half-written file.
     */
    suspend fun writeAgentsConfig(rows: List<HostAgentConfigRow>) {
        val bytes = json.encodeToString(rows).toByteArray(Charsets.UTF_8)
        val temp = "${agentsConfigPath()}.${ProcessId.value}.tmp"
        connection.writeFile(temp, bytes)
        connection.rename(temp, agentsConfigPath())
    }

    suspend fun updateAgentsConfig(update: (List<HostAgentConfigRow>) -> List<HostAgentConfigRow>) {
        writeAgentsConfig(update(agentsConfig()))
    }

    suspend fun uploadPath(sessionId: String, fileName: String): String =
        "$uploadsDir/${safe(sessionId)}/${safe(fileName)}"

    suspend fun writeUpload(sessionId: String, fileName: String, bytes: ByteArray): String {
        val path = uploadPath(sessionId, fileName)
        connection.writeFile(path, bytes)
        return path
    }

    private suspend fun writeWorkspaces(workspaces: List<HostWorkspace>) {
        connection.writeFile(
            workspacesPath(),
            json.encodeToString(workspaces).toByteArray(Charsets.UTF_8),
        )
    }

    private fun workspacesPath(): String = "$baseDir/workspaces.json"

    companion object {
        fun safe(value: String): String = value.replace(Regex("[^A-Za-z0-9._-]"), "_")

        fun stableId(path: String): String =
            "ws_" + path.hashCode().toUInt().toString(16)

        fun shellQuote(value: String): String = "'" + value.replace("'", "'\\''") + "'"
    }
}

/** Stable per-process suffix for temp files on the host. */
private object ProcessId {
    val value: String
        get() = runCatching { android.os.Process.myPid().toString() }.getOrDefault("android")
}
