package harold.android.transport

import com.jcraft.jsch.JSch
import com.jcraft.jsch.KeyPair
import harold.android.transport.ssh.SshKeyGenerator
import harold.android.transport.ssh.configureJsch
import org.junit.Assert.assertTrue
import org.junit.Test

class SshKeyGeneratorTest {
    @Test
    fun generatedKeyIsAReadableOpenSshPrivateKey() {
        val key = SshKeyGenerator.generate()
        val jsch = JSch()
        configureJsch(jsch)

        assertTrue(key.algorithm == "ed25519" || key.algorithm == "ecdsa-p256")
        assertTrue(
            key.publicKey.startsWith("ssh-ed25519 ") ||
                key.publicKey.startsWith("ecdsa-sha2-nistp256 "),
        )
        assertTrue(key.privateKeyPem.startsWith("-----BEGIN OPENSSH PRIVATE KEY-----"))
        assertTrue(key.privateKeyPem.trimEnd().endsWith("-----END OPENSSH PRIVATE KEY-----"))

        val parsed = KeyPair.load(jsch, key.privateKeyPem.toByteArray(), null)
        try {
            assertTrue(parsed.keyType == KeyPair.ED25519 || parsed.keyType == KeyPair.ECDSA)
        } finally {
            parsed.dispose()
        }
    }
}
