package harold.android.transport.ssh

import harold.android.credentials.SshConfig
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Singleton
class JschSshConnectionFactory @Inject constructor() : SshConnectionFactory {
    override suspend fun connect(config: SshConfig): SshConnection = withContext(Dispatchers.IO) {
        JschSshConnection.connect(config)
    }
}
