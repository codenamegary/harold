package harold.android.transport.routing

import harold.android.credentials.HaroldTransport
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.SshConfig
import harold.android.session.HaroldReachability
import harold.android.session.WorkspaceHaroldReachability
import java.net.InetSocketAddress
import java.net.Socket
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Singleton
class TransportHaroldReachability @Inject constructor(
    private val savedHarolds: SavedHaroldRepository,
    private val http: WorkspaceHaroldReachability,
    private val ssh: SshReachability,
) : HaroldReachability {
    override suspend fun check(serverOrigin: String): Result<Unit> {
        val credential = savedHarolds.find(serverOrigin)
        return if (credential?.transport == HaroldTransport.Ssh) {
            credential.ssh?.let { config -> ssh.check(config) }
                ?: Result.failure(IllegalStateException("SSH connection is missing its host."))
        } else {
            http.check(serverOrigin)
        }
    }
}

/** A direct connection is live when its TCP endpoint accepts a socket. */
@Singleton
class SshReachability @Inject constructor() {
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
