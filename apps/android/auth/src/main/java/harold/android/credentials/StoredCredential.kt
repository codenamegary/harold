package harold.android.credentials

data class StoredCredential(
    val formatVersion: Int,
    /**
     * Roster id. SSH connections store a synthetic `ssh://user@host:port` key
     * from [SshConfig.connectionId]. When more than one saved connection
     * points at the same SSH endpoint, later rows add a `#<number>` suffix so
     * each row keeps its own identity.
     */
    val serverOrigin: String,
    val deviceName: String?,
    val name: String,
    val colorId: String,
    val iconId: String,
    val ssh: SshConfig,
) {
    /** Human-readable endpoint without the private routing suffix. */
    val displayEndpoint: String
        get() = ssh?.let { config ->
            "ssh://${config.user}@${config.host}:${config.port}"
        } ?: serverOrigin
}
