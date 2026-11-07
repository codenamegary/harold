package harold.android.credentials

/** Authentication material for an SSH connection. */
sealed interface SshAuth {
    /** An unencrypted OpenSSH private key, stored inside the encrypted roster. */
    data class PrivateKey(
        val pem: String,
        val publicKey: String,
    ) : SshAuth

    /** A password kept inside the encrypted roster. */
    data class Password(
        val secret: String,
    ) : SshAuth
}

/**
 * SSH host coordinates. [connectionId] is the synthetic roster key, so every
 * saved connection shares one list keyed by [StoredCredential.serverOrigin].
 */
data class SshConfig(
    val host: String,
    val port: Int,
    val user: String,
    val auth: SshAuth,
    val hostKeyFingerprint: String,
) {
    val connectionId: String
        get() = "ssh://$user@$host:$port"
}
