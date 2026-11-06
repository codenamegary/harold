package harold.android.credentials

data class StoredCredential(
    val formatVersion: Int,
    val deviceId: String,
    /**
     * Roster key and routing id. HTTP connections store their server origin
     * (`http://host:port`). Direct SSH connections store a synthetic
     * `ssh://user@host:port` key from [SshConfig.connectionId].
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
)
