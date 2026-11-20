package harold.android.network

/** A forward that is live on this device and reachable from a browser. */
data class DevServerTunnel(
    val connectionId: String,
    val localUrl: String,
    val localPort: Int,
    val address: LoopbackAddress,
)

/**
 * Forwards a host's loopback port to this device over the saved SSH
 * connection. The tunnel stays open until the app process ends or the host
 * connection drops, so Chrome can keep loading after Harold goes to the
 * background.
 */
interface DevServerTunnelApi {
    /** True while at least one forward is open on this device. */
    val hasOpenTunnels: Boolean

    suspend fun open(connectionId: String, address: LoopbackAddress): Result<DevServerTunnel>

    /** Closes one tunnel and releases its SSH lease. */
    suspend fun close(tunnel: DevServerTunnel)

    /** Closes every tunnel to a connection the user has forgotten. */
    suspend fun closeConnection(connectionId: String)

    suspend fun closeAll()
}
