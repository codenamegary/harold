package harold.android.transport.ssh

import java.io.Closeable
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class HostSessionMetadata(
    val agent: String,
    val sessionId: String,
    val cwd: String,
    val title: String,
    val deviceName: String? = null,
    val createdAt: String,
    val lastUsedAt: String,
    val worktreePath: String? = null,
)

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
 * Host state under `~/.harold`. One JSON file per session, one lock file per
 * active session, and uploads grouped by session id. There is no daemon and
 * no shared index.
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
    val sessionsDir: String get() = "$baseDir/sessions"
    val locksDir: String get() = "$baseDir/locks"
    val uploadsDir: String get() = "$baseDir/uploads"

    suspend fun listSessions(): List<HostSessionMetadata> {
        val agentDirs = runCatching { connection.list(sessionsDir) }.getOrDefault(emptyList())
        return agentDirs
            .filter { entry -> entry.directory }
            .flatMap { agentDir ->
                runCatching { connection.list(agentDir.path) }.getOrDefault(emptyList())
                    .filter { entry -> !entry.directory && entry.name.endsWith(".json") }
                    .mapNotNull { entry -> readMetadata(entry.path) }
            }
            .sortedByDescending { metadata -> metadata.lastUsedAt }
    }

    suspend fun readSession(agent: String, sessionId: String): HostSessionMetadata? =
        readMetadata(sessionPath(agent, sessionId))

    suspend fun writeSession(metadata: HostSessionMetadata) {
        connection.writeFile(
            sessionPath(metadata.agent, metadata.sessionId),
            json.encodeToString(metadata).toByteArray(Charsets.UTF_8),
        )
    }

    suspend fun touchSession(agent: String, sessionId: String) {
        val existing = readSession(agent, sessionId) ?: return
        writeSession(existing.copy(lastUsedAt = Instant.now().toString()))
    }

    suspend fun deleteSession(agent: String, sessionId: String) {
        runCatching { connection.remove(sessionPath(agent, sessionId)) }
    }

    suspend fun acquireLock(agent: String, sessionId: String): Result<SshSessionLock> {
        val lockPath = "$locksDir/${safe(agent)}/${safe(sessionId)}.lock"
        val script = buildString {
            append("mkdir -p ${shellQuote(lockPath.substringBeforeLast('/'))}; ")
            append("if command -v flock >/dev/null 2>&1; then ")
            append(
                "exec flock -n ${shellQuote(lockPath)} " +
                    "sh -c 'echo LOCKED; exec cat >/dev/null'; ",
            )
            append("else ")
            append("lockdir=${shellQuote("$lockPath.d")}; ")
            append("if mkdir \"${'$'}lockdir\" 2>/dev/null; then ")
            append("trap 'rmdir \"${'$'}lockdir\"' EXIT; echo LOCKED; ")
            append("cat >/dev/null; ")
            append("else echo 'LOCKED_BY_ANOTHER_DEVICE' >&2; exit 1; fi; ")
            append("fi")
        }
        var lastError = ""
        repeat(LOCK_ATTEMPTS) { attempt ->
            val channel = connection.exec(script)
            if (awaitLocked(channel)) {
                return Result.success(SshSessionLock(lockPath, channel))
            }
            lastError = runCatching { channel.stderrText() }.getOrDefault("")
            channel.close()
            if (attempt < LOCK_ATTEMPTS - 1) {
                // A channel we just closed can take a moment to release its
                // flock. Retry before calling it another device.
                delay(LOCK_RETRY_MILLIS)
            }
        }
        return Result.failure(
            IllegalStateException(
                lastError.ifBlank { "Another device is already active in this session." },
            ),
        )
    }

    private suspend fun awaitLocked(channel: SshExecChannel): Boolean {
        val reader = channel.stdout.bufferedReader()
        val deadline = System.currentTimeMillis() + LOCK_TIMEOUT_MILLIS
        while (System.currentTimeMillis() < deadline) {
            if (channel.isClosed()) {
                return false
            }
            if (channel.stdout.available() > 0) {
                val line = reader.readLine() ?: return false
                if (line.contains("LOCKED")) {
                    return true
                }
            }
            delay(LOCK_POLL_MILLIS)
        }
        return false
    }

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

    private suspend fun readMetadata(path: String): HostSessionMetadata? {
        val bytes = runCatching { connection.readFile(path) }.getOrNull() ?: return null
        return runCatching {
            json.decodeFromString<HostSessionMetadata>(bytes.toString(Charsets.UTF_8))
        }.getOrNull()
    }

    private fun sessionPath(agent: String, sessionId: String): String =
        "$sessionsDir/${safe(agent)}/${safe(sessionId)}.json"

    private fun workspacesPath(): String = "$baseDir/workspaces.json"

    companion object {
        private const val LOCK_ATTEMPTS = 2
        private const val LOCK_TIMEOUT_MILLIS = 3000L
        private const val LOCK_POLL_MILLIS = 50L
        private const val LOCK_RETRY_MILLIS = 500L

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

class SshSessionLock(
    val path: String,
    private val channel: SshExecChannel,
) : Closeable {
    override fun close() {
        channel.close()
    }
}
