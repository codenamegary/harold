package harold.android.host

import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshConfig
import harold.android.transport.ssh.SshConnectionLease
import harold.android.transport.ssh.SshConnectionPool
import harold.android.transport.ssh.SshException
import javax.inject.Inject
import javax.inject.Singleton

/** Borrows pooled SSH connections for host operations. */
@Singleton
class HostConnections @Inject constructor(
    private val savedConnections: ConnectionRepository,
    private val connectionPool: SshConnectionPool,
) {
    suspend fun config(connectionId: String): SshConfig =
        savedConnections.find(connectionId)?.ssh
            ?: throw SshException("Saved connection not found: $connectionId")

    suspend fun open(connectionId: String): SshConnectionLease =
        connectionPool.acquire(connectionId)

    /** Stable host-identity key for a saved connection. */
    suspend fun key(connectionId: String): String =
        connectionPool.keyFor(connectionId)

    suspend fun <T> useConnection(
        connectionId: String,
        block: suspend (SshConnectionLease, SshSessionStore) -> T,
    ): T {
        val connection = connectionPool.acquire(connectionId)
        return try {
            val home = connection.realPath(".")
            block(connection, SshSessionStore(connection, home))
        } finally {
            connection.close()
        }
    }
}
