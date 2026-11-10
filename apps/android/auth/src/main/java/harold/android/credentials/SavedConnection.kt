package harold.android.credentials

data class SavedConnection(
    val formatVersion: Int,
    /**
     * Roster id. SSH connections store a synthetic `ssh://user@host:port` key
     * from [SshConfig.connectionId]. When more than one saved connection
     * points at the same SSH endpoint, later rows add a `#<number>` suffix so
     * each row keeps its own identity.
     */
    val connectionId: String,
    val deviceName: String?,
    val name: String,
    val colorId: String,
    val iconId: String,
    val ssh: SshConfig,
    /** Device-local: the agent new sessions default to on this connection. */
    val defaultAgentId: String? = null,
    /** Device-local: the workspace new sessions default to on this connection. */
    val defaultWorkspacePath: String? = null,
) {
    /** Human-readable endpoint without the private routing suffix. */
    val displayEndpoint: String
        get() = ssh?.let { config ->
            "ssh://${config.user}@${config.host}:${config.port}"
        } ?: connectionId
}
