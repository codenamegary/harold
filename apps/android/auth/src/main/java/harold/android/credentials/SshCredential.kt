package harold.android.credentials

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class SshCredentialKind {
    @SerialName("private_key")
    PrivateKey,

    @SerialName("password")
    Password,
}

/**
 * A reusable SSH identity. The secret is encrypted by [SshCredentialStore]
 * before it touches disk. Connections copy the material they need, so removing
 * a saved credential never breaks an existing saved connection.
 */
@Serializable
data class SshCredential(
    val id: String,
    val name: String,
    val kind: SshCredentialKind,
    val privateKeyPem: String? = null,
    val publicKey: String? = null,
    val password: String? = null,
    val createdAt: String,
    val lastUsedAt: String? = null,
) {
    fun toAuth(): SshAuth? = when (kind) {
        SshCredentialKind.PrivateKey -> privateKeyPem?.let { pem ->
            SshAuth.PrivateKey(pem = pem, publicKey = publicKey.orEmpty())
        }
        SshCredentialKind.Password -> password?.let { secret ->
            SshAuth.Password(secret = secret)
        }
    }
}
