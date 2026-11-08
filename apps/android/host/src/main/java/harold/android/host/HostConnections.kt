package harold.android.host

import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshConfig
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshConnectionFactory
import harold.android.transport.ssh.SshException
import javax.inject.Inject
import javax.inject.Singleton

/** Opens one-shot SSH connections for host operations. */
@Singleton
class HostConnections @Inject constructor(
    private val savedConnections: ConnectionRepository,
    private val connectionFactory: SshConnectionFactory,
) {
    suspend fun config(connectionId: String): SshConfig =
        savedConnections.find(connectionId)?.ssh
            ?: throw SshException("Saved connection not found: $connectionId")

    suspend fun open(connectionId: String): SshConnection =
        connectionFactory.connect(config(connectionId))

    suspend fun <T> useConnection(
        connectionId: String,
        block: suspend (SshConnection, SshSessionStore) -> T,
    ): T {
        val connection = connectionFactory.connect(config(connectionId))
        return try {
            val home = connection.realPath(".")
            block(connection, SshSessionStore(connection, home))
        } finally {
            connection.close()
        }
    }
}
