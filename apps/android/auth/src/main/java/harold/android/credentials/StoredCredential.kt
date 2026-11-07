package harold.android.credentials

data class StoredCredential(
    val formatVersion: Int,
    val deviceId: String,
    /**
     * Routing id. HTTP connections store their server origin
     * (`http://host:port`). Direct SSH connections store a synthetic
     * `ssh://user@host:port` key from [SshConfig.connectionId]. When more than
     * one saved connection points at the same SSH endpoint, later rows add a
     * `#<number>` suffix so each row keeps its own identity.
     */
    val serverOrigin: String,
    val deviceName: String?,
    /** Device credential for the server hub. Empty for direct SSH. */
    val credential: String,
    val name: String,
    val colorId: String,
    val iconId: String,
    val transport: HaroldTransport = HaroldTransport.Server,
    val ssh: SshConfig? = null,
) {
    /** Human-readable endpoint without the private routing suffix. */
    val displayEndpoint: String
        get() = when (transport) {
            HaroldTransport.Server -> serverOrigin
            HaroldTransport.Ssh -> ssh?.let { config ->
                "ssh://${config.user}@${config.host}:${config.port}"
            } ?: serverOrigin
        }
}
