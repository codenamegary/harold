package harold.android.host

import harold.android.contracts.AgentId
import harold.android.contracts.SessionUsage
import harold.android.network.HostUsageApi
import harold.android.transport.ssh.SshException
import harold.android.transport.ssh.runCommand
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Reads ACP usage updates from the host's per-run JSONL logs and keeps the
 * latest value per session in memory. The first refresh for an agent scans
 * every run. Later refreshes read only new bytes from the newest run.
 */
@Singleton
class HostUsageRepository @Inject constructor(
    private val connections: HostConnections,
) : HostUsageApi {
    private val hostScript: String by lazy { hostAgentScript() }
    private val cache = SessionUsageCache()
    private val lockGuard = Any()
    private val scanLocks = mutableMapOf<String, Mutex>()

    override fun cachedSessionUsage(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): SessionUsage? = cache.cachedSessionUsage(connectionId, agentId, sessionId)

    override suspend fun refreshSessionUsage(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<SessionUsage?> = runCatching {
        lockFor(connectionId, agentId).withLock {
            val cached = cache.cachedSessionUsage(connectionId, agentId, sessionId)
            val cursor = cache.cursor(connectionId, agentId)
            val full = cursor == null || !cursor.fullyScanned || cached == null
            val scan = scan(connectionId, agentId, full, cursor)

            if (full) {
                if (!scan.complete) {
                    throw SshException("The host usage scan did not finish.")
                }
                cache.replaceAgent(
                    connectionId = connectionId,
                    agentId = agentId,
                    sessions = scan.sessions,
                    newestRunId = scan.newestRunId,
                    newestRunOffset = scan.newestRunOffset,
                )
            } else {
                if (scan.newestRunId == null) {
                    return@withLock cached
                }
                cache.mergeAgent(
                    connectionId = connectionId,
                    agentId = agentId,
                    sessions = scan.sessions,
                    newestRunId = scan.newestRunId,
                    newestRunOffset = scan.newestRunOffset,
                )
            }
            cache.cachedSessionUsage(connectionId, agentId, sessionId)
        }
    }

    override fun forgetSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) {
        cache.forgetSession(connectionId, agentId, sessionId)
    }

    override fun forgetConnection(connectionId: String) {
        cache.forgetConnection(connectionId)
        synchronized(lockGuard) {
            scanLocks.keys.removeAll { key -> key.startsWith("$connectionId|") }
        }
    }

    private suspend fun scan(
        connectionId: String,
        agentId: AgentId,
        full: Boolean,
        cursor: UsageAgentCursor?,
    ): HostUsageScan {
        val command = if (full) {
            hostUsageCommand(hostScript, agentId)
        } else {
            hostUsageCommand(
                script = hostScript,
                agentId = agentId,
                latest = true,
                knownRunId = cursor?.newestRunId,
                knownOffset = cursor?.newestRunOffset,
            )
        }
        return connections.useConnection(connectionId) { connection, _ ->
            val result = connection.runCommand(command)
            if (!result.succeeded) {
                throw SshException(
                    result.stderr.trim().ifBlank { "Could not read usage from the host." },
                )
            }
            parseHostUsage(result.stdout)
        }
    }

    private fun lockFor(connectionId: String, agentId: String): Mutex =
        synchronized(lockGuard) {
            scanLocks.getOrPut("$connectionId|$agentId") { Mutex() }
        }
}
