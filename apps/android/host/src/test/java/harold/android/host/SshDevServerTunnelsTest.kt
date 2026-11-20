package harold.android.host

import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.network.LoopbackAddress
import harold.android.testing.FakeConnectionStore
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshConnectionFactory
import harold.android.transport.ssh.SshException
import harold.android.transport.ssh.SshExecChannel
import harold.android.transport.ssh.SshFileEntry
import harold.android.transport.ssh.SshLocalPortForward
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SshDevServerTunnelsTest {
    @Test
    fun aTunnelGetsItsOwnSessionAndPrefersTheRemotePort() = runTest {
        val row = saved("row")
        val harness = harness(row)

        val tunnel = harness.tunnels.open(row.connectionId, address(8765)).getOrThrow()

        assertEquals(1, harness.factory.connects)
        assertEquals(1, harness.factory.connections.size)
        val connection = harness.factory.connections.single()
        assertEquals(listOf("127.0.0.1:8765:8765"), connection.forwardRequests)
        assertEquals(8765, tunnel.localPort)
        assertEquals("http://127.0.0.1:8765/", tunnel.localUrl)
        assertTrue(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun openingTheSameAddressAgainReusesTheForwardAndTheSession() = runTest {
        val row = saved("row")
        val harness = harness(row)

        val first = harness.tunnels.open(row.connectionId, address(8765)).getOrThrow()
        val second = harness.tunnels.open(row.connectionId, address(8765)).getOrThrow()

        assertEquals(1, harness.factory.connects)
        val connection = harness.factory.connections.single()
        assertEquals(1, connection.forwardRequests.size)
        assertEquals(0, connection.closedForwards)
        assertEquals(first, second)
    }

    @Test
    fun eachSavedConnectionGetsItsOwnSessionAndClosingOneKeepsTheOther() = runTest {
        val first = saved("first")
        val second = saved("second")
        val harness = harness(first, second)

        val firstTunnel = harness.tunnels.open(first.connectionId, address(8765)).getOrThrow()
        val secondTunnel = harness.tunnels.open(second.connectionId, address(8765)).getOrThrow()

        assertEquals(2, harness.factory.connects)
        val firstConnection = harness.factory.connections[0]
        val secondConnection = harness.factory.connections[1]
        assertEquals(listOf("127.0.0.1:8765:8765"), firstConnection.forwardRequests)
        assertEquals(listOf("127.0.0.1:8765:8765"), secondConnection.forwardRequests)

        harness.tunnels.close(firstTunnel)

        assertTrue(firstConnection.isClosed)
        assertFalse(secondConnection.isClosed)
        assertTrue(harness.tunnels.hasOpenTunnels)

        harness.tunnels.close(secondTunnel)

        assertTrue(secondConnection.isClosed)
        assertFalse(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun wildcardAndLocalhostAddressesForwardToTheHostLoopback() = runTest {
        val row = saved("row")
        val harness = harness(row)

        harness.tunnels.open(row.connectionId, address(port = 3000, host = "0.0.0.0"))
            .getOrThrow()
        harness.tunnels.open(row.connectionId, address(port = 4000, host = "localhost"))
            .getOrThrow()

        assertEquals(
            listOf("127.0.0.1:3000:3000", "127.0.0.1:4000:4000"),
            harness.factory.connections.single().forwardRequests,
        )
    }

    @Test
    fun closingTheLastForwardOnAConnectionClosesItsSession() = runTest {
        val row = saved("row")
        val harness = harness(row)
        val first = harness.tunnels.open(row.connectionId, address(8765)).getOrThrow()
        val second = harness.tunnels.open(row.connectionId, address(8766)).getOrThrow()
        val connection = harness.factory.connections.single()

        harness.tunnels.close(first)

        assertFalse(connection.isClosed)
        assertEquals(1, connection.closedForwards)
        assertTrue(harness.tunnels.hasOpenTunnels)

        harness.tunnels.close(second)

        assertTrue(connection.isClosed)
        assertEquals(1, connection.closes)
        assertFalse(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun aForwardFailureOnADeadConnectionReconnectsOnTheNextOpen() = runTest {
        val row = saved("row")
        val harness = harness(row)
        harness.factory.failNextForward = true

        val failed = harness.tunnels.open(row.connectionId, address(8765))

        assertTrue(failed.isFailure)
        val dead = harness.factory.connections.single()
        assertTrue(dead.isClosed)
        assertFalse(harness.tunnels.hasOpenTunnels)

        val retried = harness.tunnels.open(row.connectionId, address(8765))

        assertTrue(retried.isSuccess)
        assertEquals(2, harness.factory.connects)
        assertTrue(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun hasOpenTunnelsFollowsTheLiveForwardsOnly() = runTest {
        val row = saved("row")
        val harness = harness(row)
        assertFalse(harness.tunnels.hasOpenTunnels)

        harness.tunnels.open(row.connectionId, address(8765)).getOrThrow()
        assertTrue(harness.tunnels.hasOpenTunnels)

        harness.factory.connections.single().markDead()
        assertFalse(harness.tunnels.hasOpenTunnels)

        harness.tunnels.open(row.connectionId, address(8765)).getOrThrow()
        assertEquals(2, harness.factory.connects)
        assertTrue(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun aCancelledOpenDoesNotLeakTheForward() = runTest {
        val row = saved("row")
        val harness = harness(row)
        harness.factory.cancelCallerAfterBind = true

        val opening = launch {
            harness.tunnels.open(row.connectionId, address(8765))
        }
        opening.join()

        assertTrue(opening.isCancelled)
        val connection = harness.factory.connections.single()
        assertEquals(1, connection.closedForwards)
        assertTrue(connection.isClosed)
        assertFalse(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun aCloseDuringAnOpenKeepsTheSessionTheOpenIsUsing() = runTest {
        val row = saved("row")
        val harness = harness(row)
        val first = harness.tunnels.open(row.connectionId, address(8765)).getOrThrow()
        val connection = harness.factory.connections.single()
        harness.factory.forwardGate = CompletableDeferred()

        val opening = launch {
            harness.tunnels.open(row.connectionId, address(8766))
        }
        runCurrent()

        harness.tunnels.close(first)
        harness.factory.forwardGate?.complete(Unit)
        opening.join()

        assertFalse(connection.isClosed)
        assertEquals(0, connection.closes)
        assertTrue(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun aBindFailureOnAHealthySessionClosesIt() = runTest {
        val row = saved("row")
        val harness = harness(row)
        harness.factory.failNextForwardKeepingSession = true

        val failed = harness.tunnels.open(row.connectionId, address(8765))

        assertTrue(failed.isFailure)
        val connection = harness.factory.connections.single()
        assertTrue(connection.isClosed)
        assertEquals(1, connection.closes)
        assertFalse(harness.tunnels.hasOpenTunnels)

        assertTrue(harness.tunnels.open(row.connectionId, address(8765)).isSuccess)
        assertEquals(2, harness.factory.connects)
    }

    @Test
    fun aStaleHandleClosesNothing() = runTest {
        val first = saved("first")
        val second = saved("second")
        val harness = harness(first, second)
        val firstTunnel = harness.tunnels.open(first.connectionId, address(8765)).getOrThrow()
        val secondTunnel = harness.tunnels.open(second.connectionId, address(8765)).getOrThrow()
        val secondConnection = harness.factory.connections[1]

        // The port now belongs to the second connection's forward. The first
        // connection's handle names the same address, so the port decides.
        harness.tunnels.close(firstTunnel.copy(localPort = secondTunnel.localPort))

        assertFalse(secondConnection.isClosed)
        assertEquals(0, secondConnection.closedForwards)
        assertTrue(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun deadForwardsArePrunedSoTheyDoNotKeepTheServiceAlive() = runTest {
        val row = saved("row")
        val harness = harness(row)
        harness.tunnels.open(row.connectionId, address(8765)).getOrThrow()
        val connection = harness.factory.connections.single()

        connection.markDead()

        assertFalse(harness.tunnels.hasOpenTunnels)
        assertEquals(1, connection.closedForwards)

        assertTrue(harness.tunnels.open(row.connectionId, address(8765)).isSuccess)
        assertEquals(2, harness.factory.connects)
        assertTrue(harness.tunnels.hasOpenTunnels)
    }

    @Test
    fun closeConnectionClosesOnlyThatConnectionsTunnels() = runTest {
        val first = saved("first")
        val second = saved("second")
        val harness = harness(first, second)
        harness.tunnels.open(first.connectionId, address(8765)).getOrThrow()
        harness.tunnels.open(first.connectionId, address(8766)).getOrThrow()
        harness.tunnels.open(second.connectionId, address(8765)).getOrThrow()
        val firstConnection = harness.factory.connections[0]
        val secondConnection = harness.factory.connections[1]

        harness.tunnels.closeConnection(first.connectionId)

        assertTrue(firstConnection.isClosed)
        assertEquals(2, firstConnection.closedForwards)
        assertFalse(secondConnection.isClosed)
        assertEquals(0, secondConnection.closedForwards)
        assertTrue(harness.tunnels.hasOpenTunnels)
    }

    private suspend fun harness(vararg rows: SavedConnection): Harness {
        val store = FakeConnectionStore()
        rows.forEach { row -> store.save(row) }
        val factory = FakeSshConnectionFactory()
        return Harness(
            factory = factory,
            tunnels = SshDevServerTunnels(ConnectionRepository(store), factory),
        )
    }

    private fun address(port: Int, host: String = "127.0.0.1"): LoopbackAddress =
        LoopbackAddress(host = host, port = port)

    private fun saved(id: String): SavedConnection = SavedConnection(
        formatVersion = 3,
        connectionId = id,
        deviceName = "Pixel",
        name = id,
        colorId = "tide",
        iconId = "terminal",
        ssh = SshConfig(
            host = "$id.local",
            port = 22,
            user = "gary",
            auth = SshAuth.Password("hunter2"),
            hostKeyFingerprint = "SHA256:$id",
        ),
    )
}

private class Harness(
    val factory: FakeSshConnectionFactory,
    val tunnels: SshDevServerTunnels,
)

/**
 * Hands out fake sessions and holds the switches a test flips mid-flight. The
 * sessions read the switches on every call, because a forward can happen on a
 * session that outlives the connect that made it.
 */
private class FakeSshConnectionFactory : SshConnectionFactory {
    val connections = mutableListOf<FakeSshConnection>()
    var connects: Int = 0
        private set
    var failNextForward: Boolean = false
    var failNextForwardKeepingSession: Boolean = false
    var cancelCallerAfterBind: Boolean = false
    var forwardGate: CompletableDeferred<Unit>? = null
    val ports = LoopbackPortSpace()

    override suspend fun connect(config: SshConfig): SshConnection {
        connects += 1
        return FakeSshConnection(this).also { connection -> connections += connection }
    }
}

/**
 * One device-wide loopback port space, so a second forward for a port another
 * session already holds gets an ephemeral one, as the OS would give it.
 */
private class LoopbackPortSpace {
    private val bound = mutableSetOf<Int>()
    private var nextEphemeral = 40_000

    fun claim(preferredLocalPort: Int?): Int {
        if (preferredLocalPort != null && bound.add(preferredLocalPort)) {
            return preferredLocalPort
        }
        var candidate = nextEphemeral
        while (!bound.add(candidate)) {
            candidate += 1
        }
        nextEphemeral = candidate + 1
        return candidate
    }
}

private class FakeSshConnection(
    private val factory: FakeSshConnectionFactory,
) : SshConnection {
    var closes: Int = 0
        private set
    var closedForwards: Int = 0
        private set
    val forwardRequests = mutableListOf<String>()
    private var connected = true

    val isClosed: Boolean get() = closes > 0

    override val isConnected: Boolean get() = connected

    fun markDead() {
        connected = false
    }

    override suspend fun forwardLocalPort(
        remoteHost: String,
        remotePort: Int,
        preferredLocalPort: Int?,
    ): SshLocalPortForward {
        forwardRequests += "$remoteHost:$remotePort:${preferredLocalPort ?: "ephemeral"}"
        if (factory.failNextForward) {
            factory.failNextForward = false
            // A session that dies mid-forward is the case the tunnels have to
            // recognise, so the failure arrives with the connection gone.
            connected = false
            throw SshException("The SSH connection dropped while forwarding")
        }
        if (factory.failNextForwardKeepingSession) {
            factory.failNextForwardKeepingSession = false
            throw SshException("Port forwarding failed")
        }
        val forward = SshLocalPortForward(
            localPort = factory.ports.claim(preferredLocalPort),
            remoteHost = remoteHost,
            remotePort = remotePort,
            release = { closedForwards += 1 },
        )
        if (factory.cancelCallerAfterBind) {
            // The real transport binds on the IO dispatcher and resumes the
            // caller already cancelled, with the listener up.
            currentCoroutineContext()[Job]?.cancel()
        }
        factory.forwardGate?.await()
        return forward
    }

    override suspend fun exec(command: String): SshExecChannel = error("unused")

    override suspend fun readFile(path: String): ByteArray = error("unused")

    override suspend fun writeFile(path: String, content: ByteArray) = error("unused")

    override suspend fun rename(oldPath: String, newPath: String) = error("unused")

    override suspend fun list(path: String): List<SshFileEntry> = error("unused")

    override suspend fun stat(path: String): SshFileEntry? = error("unused")

    override suspend fun mkdir(path: String) = error("unused")

    override suspend fun remove(path: String) = error("unused")

    override suspend fun realPath(path: String): String = error("unused")

    override fun close() {
        closes += 1
        connected = false
    }
}
