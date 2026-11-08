package harold.android.transport.ssh

import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.setup.SshSetupApi
import harold.android.setup.SshSetupAuth
import harold.android.setup.SshSetupKey
import harold.android.setup.SshSetupTarget
import javax.inject.Inject
import javax.inject.Singleton

/** SSH key generation and host-key probing for the setup screen. */
@Singleton
class SshSetup @Inject constructor(
    private val enrollment: SshEnrollment,
) : SshSetupApi {
    override fun generateKey(): SshSetupKey {
        val key = SshKeyGenerator.generate()
        return SshSetupKey(
            privateKeyPem = key.privateKeyPem,
            publicKey = key.publicKey,
        )
    }

    override suspend fun probe(target: SshSetupTarget): Result<String> =
        enrollment.probe(target.toConfig())

    private fun SshSetupTarget.toConfig(): SshConfig {
        val credentials = when (val value = auth) {
            is SshSetupAuth.PrivateKey -> SshAuth.PrivateKey(value.pem, value.publicKey)
            is SshSetupAuth.Password -> SshAuth.Password(value.secret)
        }
        return SshConfig(
            host = host,
            port = port,
            user = user,
            auth = credentials,
            hostKeyFingerprint = hostKeyFingerprint,
        )
    }
}
