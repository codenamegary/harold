package harold.android.credentials

/** How the app reaches an agent on a saved connection. */
enum class HaroldTransport {
    /** Harold Hub: HTTP + SSE to a Harold daemon. */
    Server,

    /** Harold Direct: SSH exec straight to an ACP agent. */
    Ssh,
}

/** Authentication material for a direct SSH connection. */
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
 * Direct-mode host coordinates. [connectionId] is the synthetic roster key,
 * so server-origin storage and direct connections share one list.
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

/** Feature flags the UI uses instead of pretending both transports are equal. */
data class ConnectionCapabilities(
    val liveFanOut: Boolean,
    val centralizedReplay: Boolean,
    val multiDeviceActiveSession: Boolean,
    val qrPairing: Boolean,
    val sshKeyPairing: Boolean,
    val fileBrowse: Boolean,
    val attachments: Boolean,
    val git: Boolean,
    val worktrees: Boolean,
    val serverManagedAuth: Boolean,
    val webClient: Boolean,
    val sessionSurvivesDisconnect: Boolean,
)

val ServerCapabilities = ConnectionCapabilities(
    liveFanOut = true,
    centralizedReplay = true,
    multiDeviceActiveSession = true,
    qrPairing = true,
    sshKeyPairing = false,
    fileBrowse = true,
    attachments = true,
    git = true,
    worktrees = true,
    serverManagedAuth = true,
    webClient = true,
    sessionSurvivesDisconnect = true,
)

val SshCapabilities = ConnectionCapabilities(
    liveFanOut = false,
    centralizedReplay = false,
    multiDeviceActiveSession = false,
    qrPairing = false,
    sshKeyPairing = true,
    fileBrowse = true,
    attachments = true,
    git = true,
    worktrees = true,
    serverManagedAuth = false,
    webClient = false,
    sessionSurvivesDisconnect = false,
)

fun capabilitiesOf(transport: HaroldTransport): ConnectionCapabilities =
    when (transport) {
        HaroldTransport.Server -> ServerCapabilities
        HaroldTransport.Ssh -> SshCapabilities
    }

fun StoredCredential.capabilities(): ConnectionCapabilities = capabilitiesOf(transport)
