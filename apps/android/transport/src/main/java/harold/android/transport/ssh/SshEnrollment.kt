package harold.android.transport.ssh

import harold.android.credentials.SshConfig
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

fun interface SshProbe {
    suspend fun probe(config: SshConfig): Result<String>
}

/**
 * First-connect flow: capture the host key, then authenticate against that
 * exact key. The UI shows the fingerprint before the connection is saved.
 */
@Singleton
class SshEnrollment @Inject constructor() : SshProbe {
    override suspend fun probe(config: SshConfig): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val fingerprint = captureHostKeyFingerprint(config)
            val pinned = JschSshConnection.connect(
                config.copy(hostKeyFingerprint = fingerprint),
            )
            pinned.close()
            fingerprint
        }
    }
}
