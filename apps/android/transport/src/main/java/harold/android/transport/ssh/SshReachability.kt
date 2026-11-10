package harold.android.transport.ssh

import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshConfig
import harold.android.session.ConnectionReachability
import java.net.InetSocketAddress
import java.net.Socket
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** A saved connection is live when its TCP endpoint accepts a socket. */
@Singleton
class SshReachability @Inject constructor(
    private val savedConnections: ConnectionRepository,
) : ConnectionReachability {
    override suspend fun check(connectionId: String): Result<Unit> {
        val config = savedConnections.find(connectionId)?.ssh
            ?: return Result.failure(IllegalStateException("Saved connection not found: $connectionId"))
        return check(config)
    }

    suspend fun check(config: SshConfig): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(config.host, config.port), TIMEOUT_MILLIS)
            }
            Unit
        }
    }

    companion object {
        private const val TIMEOUT_MILLIS = 3500
    }
}
