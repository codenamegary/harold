package harold.android.host

import harold.android.credentials.ConnectionRepository
import harold.android.network.DevServerTunnel
import harold.android.network.DevServerTunnelApi
import harold.android.network.LoopbackAddress
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshConnectionFactory
import harold.android.transport.ssh.SshException
import harold.android.transport.ssh.SshLocalPortForward
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Forwards host loopback ports to this device over SSH.
 *
 * Forwards get their own SSH session per saved connection instead of riding
 * the pooled session that serves agent processes, SFTP and command execs.
 * Channels on the pooled session open and close constantly, and closing one
 * can take the whole transport down with it. A page in the browser must not
 * die because a chat stream detached.
 *
 * One tunnel per connection, host and port, so tapping the same link twice
 * reuses the same local origin and keeps its cookies.
 */
@Singleton
class SshDevServerTunnels @Inject constructor(
    private val savedConnections: ConnectionRepository,
    private val connectionFactory: SshConnectionFactory,
) : DevServerTunnelApi {
    private val connectLock = Mutex()
    private val sessions = ConcurrentHashMap<String, SshConnection>()
    private val tunnels = ConcurrentHashMap<String, Entry>()

    /**
     * Opens still building a forward, per connection. Closing the last tunnel
     * of a connection while another open is in flight must not close the
     * session that open is already forwarding on.
     */
    private val opensInFlight = ConcurrentHashMap<String, Int>()

    override val hasOpenTunnels: Boolean
        get() {
            pruneDeadTunnels()
            return tunnels.isNotEmpty()
        }

    override suspend fun open(
        connectionId: String,
        address: LoopbackAddress,
    ): Result<DevServerTunnel> {
        beginOpen(connectionId)
        var forwarded = false
        try {
            val tunnel = openTunnel(connectionId, address)
            forwarded = true
            return Result.success(tunnel)
        } catch (error: CancellationException) {
            // Giving up on a forward is the caller's decision, not a tunnel
            // failure, and a cancelled caller must not receive a tunnel.
            throw error
        } catch (error: Throwable) {
            return Result.failure(error)
        } finally {
            endOpen(connectionId)
            if (!forwarded) {
                releaseUnusedSession(connectionId)
            }
        }
    }

    override suspend fun close(tunnel: DevServerTunnel) {
        val key = tunnelKey(tunnel.connectionId, tunnel.address)
        val entry = tunnels[key] ?: return
        // A stale handle names the same connection and address but a port the
        // current forward no longer holds, so it closes nothing.
        if (entry.forward.localPort != tunnel.localPort) {
            return
        }
        if (tunnels.remove(key, entry)) {
            entry.closeForward()
        }
        releaseUnusedSession(tunnel.connectionId)
    }

    override suspend fun closeConnection(connectionId: String) {
        tunnels.entries.toList().forEach { (key, entry) ->
            if (entry.connectionId == connectionId && tunnels.remove(key, entry)) {
                entry.closeForward()
            }
        }
        sessions.remove(connectionId)?.let { connection -> runCatching { connection.close() } }
    }

    override suspend fun closeAll() {
        tunnels.values.toList().forEach { entry -> entry.closeForward() }
        tunnels.clear()
        sessions.values.toList().forEach { connection ->
            runCatching { connection.close() }
        }
        sessions.clear()
    }

    /** One SSH session per saved connection, reconnected when it dies. */
    private suspend fun sessionFor(connectionId: String): SshConnection {
        sessions[connectionId]?.let { current ->
            if (current.isConnected) {
                return current
            }
            dropSession(connectionId, current)
        }
        return connectLock.withLock {
            sessions[connectionId]?.let { current ->
                if (current.isConnected) {
                    return@withLock current
                }
                dropSession(connectionId, current)
            }
            val config = savedConnections.find(connectionId)?.ssh
                ?: throw SshException("Saved connection not found: $connectionId")
            connectionFactory.connect(config).also { created ->
                sessions[connectionId] = created
            }
        }
    }

    /**
     * The forward for [address], reusing the live one when the user taps the
     * same link twice.
     */
    private suspend fun openTunnel(
        connectionId: String,
        address: LoopbackAddress,
    ): DevServerTunnel {
        val key = tunnelKey(connectionId, address)
        val existing = tunnels[key]
        if (existing != null) {
            if (existing.isLive()) {
                return existing.tunnelFor(address)
            }
            if (tunnels.remove(key, existing)) {
                existing.closeForward()
            }
        }
        val connection = sessionFor(connectionId)
        val forward = connection.forwardLocalPort(
            remoteHost = forwardHost(address.host),
            remotePort = address.port,
            preferredLocalPort = address.port,
        )
        val entry = Entry(
            connectionId = connectionId,
            connection = connection,
            forward = forward,
            address = address,
        )
        // Binding happens off this thread, so the cancellation that ends this
        // open can arrive with the listener already up. A forward that cannot
        // be recorded is a listener nothing can reach or close, so it goes.
        var recorded = false
        try {
            currentCoroutineContext().ensureActive()
            tunnels[key] = entry
            recorded = true
        } finally {
            if (!recorded) {
                entry.closeForward()
            }
        }
        return entry.tunnelFor(address)
    }

    /**
     * Closes a session that has nothing left to serve: no forward, and no open
     * still building one on it. A session that failed to bind is as useless as
     * a dead one.
     */
    private fun releaseUnusedSession(connectionId: String) {
        if (tunnels.values.any { entry -> entry.connectionId == connectionId }) {
            return
        }
        if ((opensInFlight[connectionId] ?: 0) > 0) {
            return
        }
        sessions.remove(connectionId)?.let { connection -> runCatching { connection.close() } }
    }

    /**
     * Forgets forwards whose connection died. Their local listener is
     * unreachable, and without this the map grows for the life of the process.
     */
    private fun pruneDeadTunnels() {
        tunnels.entries.toList().forEach { (key, entry) ->
            if (!entry.isLive() && tunnels.remove(key, entry)) {
                entry.closeForward()
            }
        }
    }

    private fun beginOpen(connectionId: String) {
        opensInFlight.merge(connectionId, 1, Int::plus)
    }

    private fun endOpen(connectionId: String) {
        opensInFlight.compute(connectionId) { _, count ->
            val remaining = (count ?: 1) - 1
            if (remaining > 0) remaining else null
        }
    }

    private fun dropSession(connectionId: String, connection: SshConnection) {
        if (sessions.remove(connectionId, connection)) {
            runCatching { connection.close() }
        }
    }

    private fun tunnelKey(connectionId: String, address: LoopbackAddress): String =
        "$connectionId|${forwardHost(address.host)}|${address.port}|${address.secure}"

    /**
     * The host side of a forward connects to its own loopback. A wildcard
     * bind address names every interface, not a destination, so it maps to
     * loopback rather than being passed to sshd.
     */
    private fun forwardHost(host: String): String = when (host.lowercase()) {
        "localhost", "0.0.0.0", "::" -> "127.0.0.1"
        else -> host
    }

    private class Entry(
        val connectionId: String,
        val connection: SshConnection,
        val forward: SshLocalPortForward,
        val address: LoopbackAddress,
    ) {
        fun isLive(): Boolean = connection.isConnected

        fun tunnelFor(requested: LoopbackAddress): DevServerTunnel = DevServerTunnel(
            connectionId = connectionId,
            localUrl = "${if (requested.secure) "https" else "http"}://" +
                "127.0.0.1:${forward.localPort}${requested.path}",
            localPort = forward.localPort,
            address = requested,
        )

        fun closeForward() {
            runCatching { forward.close() }
        }
    }
}
