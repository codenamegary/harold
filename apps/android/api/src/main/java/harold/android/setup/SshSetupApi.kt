package harold.android.setup

data class SshSetupKey(val privateKeyPem: String, val publicKey: String)

sealed interface SshSetupAuth {
    data class PrivateKey(val pem: String, val publicKey: String) : SshSetupAuth
    data class Password(val secret: String) : SshSetupAuth
}

data class SshSetupTarget(
    val host: String,
    val port: Int,
    val user: String,
    val auth: SshSetupAuth,
    val hostKeyFingerprint: String,
)

/** First-connect key generation and host-key probing. */
interface SshSetupApi {
    fun generateKey(): SshSetupKey

    /** Returns the captured SHA-256 host-key fingerprint. */
    suspend fun probe(target: SshSetupTarget): Result<String>
}
