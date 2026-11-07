package harold.android.transport.ssh

import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.SshConfig
import harold.android.session.HaroldReachability
import java.net.InetSocketAddress
import java.net.Socket
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** A saved connection is live when its TCP endpoint accepts a socket. */
@Singleton
class SshReachability @Inject constructor(
    private val savedHarolds: SavedHaroldRepository,
) : HaroldReachability {
    override suspend fun check(serverOrigin: String): Result<Unit> {
        val config = savedHarolds.find(serverOrigin)?.ssh
            ?: return Result.failure(IllegalStateException("Saved connection not found: $serverOrigin"))
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
