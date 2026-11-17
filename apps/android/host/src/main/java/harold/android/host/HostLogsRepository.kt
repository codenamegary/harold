package harold.android.host

import harold.android.contracts.HostLogs
import harold.android.contracts.LogCleanupPolicy
import harold.android.contracts.LogCleanupResult
import harold.android.network.HostLogsApi
import harold.android.transport.ssh.SshException
import harold.android.transport.ssh.runCommand
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** Reads and prunes the per-process agent log directories on one host. */
@Singleton
class HostLogsRepository @Inject constructor(
    private val connections: HostConnections,
) : HostLogsApi {
    private val hostScript: String by lazy { hostAgentScript() }

    override suspend fun listHostLogs(connectionId: String): Result<HostLogs> = logsCall {
        connections.useConnection(connectionId) { connection, store ->
            val result = connection.runCommand(hostLogsCommand(hostScript))
            if (!result.succeeded) {
                throw SshException(
                    result.stderr.trim().ifBlank { "Could not read the agent logs on the host." },
                )
            }
            val displayNames = store.agentsConfig()
                .associate { row ->
                    row.id to (row.displayName ?: knownAgent(row.id)?.displayName)
                }
            parseHostLogs(
                output = result.stdout,
                fetchedAt = Instant.now(),
                displayNames = displayNames,
            )
        }
    }

    override suspend fun cleanupHostLogs(
        connectionId: String,
        policy: LogCleanupPolicy,
    ): Result<LogCleanupResult> = logsCall {
        connections.useConnection(connectionId) { connection, _ ->
            val result = connection.runCommand(hostCleanupCommand(hostScript, policy))
            if (!result.succeeded) {
                throw SshException(
                    result.stderr.trim().ifBlank { "Could not clean up the agent logs on the host." },
                )
            }
            parseLogCleanupResult(result.stdout)
                ?: throw SshException("The host returned an unexpected cleanup response.")
        }
    }

    private suspend fun <T> logsCall(block: suspend () -> T): Result<T> =
        try {
            Result.success(block())
        } catch (error: Throwable) {
            Result.failure(error)
        }
}
