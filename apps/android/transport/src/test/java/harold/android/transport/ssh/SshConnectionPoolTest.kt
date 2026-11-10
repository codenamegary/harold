package harold.android.transport.ssh

import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.testing.FakeConnectionStore
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Test

class SshConnectionPoolTest {
    @Test
    fun acquireReleaseAcquireReusesOneSession() = runTest {
        val row = saved("row")
        val harness = harness(row)

        harness.pool.acquire(row.connectionId).close()
        val lease = harness.pool.acquire(row.connectionId)

        assertEquals(1, harness.factory.connects)
        assertEquals(1, harness.factory.connections.size)
        assertEquals(0, harness.factory.connections.single().closes)
        assertTrue(lease.isConnected)
        lease.close()
    }

    @Test
    fun closingOneLeaseDoesNotCloseTheSharedConnection() = runTest {
        val row = saved("row")
        val harness = harness(row)
        val first = harness.pool.acquire(row.connectionId)
        val second = harness.pool.acquire(row.connectionId)

        first.close()

        val connection = harness.factory.connections.single()
        assertFalse(connection.isClosed)
        assertTrue(second.isConnected)

        val third = harness.pool.acquire(row.connectionId)
        assertEquals(1, harness.factory.connects)
        assertTrue(third.isConnected)

        second.close()
        third.close()
        assertFalse(connection.isClosed)
    }

    @Test
    fun concurrentExecCallsShareOneConnection() = runTest {
        val row = saved("row")
        val harness = harness(row)
        val first = harness.pool.acquire(row.connectionId)
        val second = harness.pool.acquire(row.connectionId)

        val one = async { first.exec("one").stdoutText() }
        val two = async { second.exec("two").stdoutText() }

        assertEquals("ran:one", one.await())
        assertEquals("ran:two", two.await())
        assertEquals(1, harness.factory.connects)
        assertEquals(listOf("one", "two"), harness.factory.connections.single().execCommands.sorted())

        first.close()
        second.close()
    }

    @Test
    fun execAndSftpReadRunConcurrentlyOnOneConnection() = runTest {
        val row = saved("row")
        val harness = harness(row)
        val first = harness.pool.acquire(row.connectionId)
        val second = harness.pool.acquire(row.connectionId)

        val exec = async { first.exec("work").stdoutText() }
        val read = async { String(second.readFile("/tmp/file"), Charsets.UTF_8) }

        assertEquals("ran:work", exec.await())
        assertEquals("content:/tmp/file", read.await())
        assertEquals(1, harness.factory.connects)
        val connection = harness.factory.connections.single()
        assertEquals(listOf("work"), connection.execCommands)
        assertEquals(listOf("/tmp/file"), connection.readPaths)

        first.close()
        second.close()
    }

    @Test
    fun deadConnectionIsEvictedAndNextAcquireReconnects() = runTest {
        val row = saved("row")
        val harness = harness(row)
        harness.pool.acquire(row.connectionId).close()
        val dead = harness.factory.connections.single()
        dead.markDead()

        val lease = harness.pool.acquire(row.connectionId)

        assertEquals(2, harness.factory.connects)
        assertEquals(1, dead.closes)
        assertNotSame(dead, harness.factory.connections.last())
        assertTrue(lease.isConnected)
        lease.close()
    }

    @Test
    fun savedRowsShareByEndpointAndCredentialsButNotByCredentialChanges() = runTest {
        val first = saved("first", ssh(secret = "same"))
        val second = saved("second", ssh(secret = "same"))
        val other = saved("other", ssh(secret = "different"))
        val harness = harness(first, second, other)

        harness.pool.acquire(first.connectionId).close()
        harness.pool.acquire(second.connectionId).close()
        assertEquals(1, harness.factory.connects)
        assertEquals(
            harness.pool.keyFor(first.connectionId),
            harness.pool.keyFor(second.connectionId),
        )

        harness.pool.acquire(other.connectionId).close()
        assertEquals(2, harness.factory.connects)
        assertNotEquals(
            harness.pool.keyFor(first.connectionId),
            harness.pool.keyFor(other.connectionId),
        )
    }

    @Test
    fun closeOnlyClosesTheKeyWhenNoOtherSavedRowUsesIt() = runTest {
        val first = saved("first")
        val second = saved("second")
        val harness = harness(first, second)
        harness.pool.acquire(first.connectionId).close()
        harness.pool.acquire(second.connectionId).close()
        val connection = harness.factory.connections.single()

        harness.pool.close(first.connectionId)

        assertFalse(connection.isClosed)
        assertEquals(0, connection.closes)

        harness.store.remove(first.connectionId)
        harness.pool.close(second.connectionId)

        assertTrue(connection.isClosed)
        assertEquals(1, connection.closes)
    }

    @Test
    fun trimIdleClosesOnlyIdleEntries() = runTest {
        val row = saved("row")
        val harness = harness(row)
        val lease = harness.pool.acquire(row.connectionId)
        val connection = harness.factory.connections.single()

        harness.pool.trimIdle(0)
        assertFalse(connection.isClosed)

        lease.close()
        harness.pool.trimIdle(0)
        assertTrue(connection.isClosed)
        assertEquals(1, connection.closes)

        val again = harness.pool.acquire(row.connectionId)
        assertEquals(2, harness.factory.connects)
        again.close()
    }

    private suspend fun harness(vararg rows: SavedConnection): Harness {
        val store = FakeConnectionStore()
        rows.forEach { row -> store.save(row) }
        val repository = ConnectionRepository(store)
        val factory = FakeSshConnectionFactory()
        return Harness(
            store = store,
            factory = factory,
            pool = JschSshConnectionPool(repository, factory),
        )
    }

    private fun saved(id: String, config: SshConfig = ssh()): SavedConnection = SavedConnection(
        formatVersion = 3,
        connectionId = id,
        deviceName = "Pixel",
        name = id,
        colorId = "tide",
        iconId = "terminal",
        ssh = config,
    )

    private fun ssh(secret: String = "hunter2"): SshConfig = SshConfig(
        host = "laptop.local",
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret),
        hostKeyFingerprint = "SHA256:laptop",
    )
}

private class Harness(
    val store: FakeConnectionStore,
    val factory: FakeSshConnectionFactory,
    val pool: SshConnectionPool,
)

private class FakeSshConnectionFactory : SshConnectionFactory {
    val connections = mutableListOf<FakeSshConnection>()
    var connects: Int = 0
        private set

    override suspend fun connect(config: SshConfig): SshConnection {
        connects += 1
        return FakeSshConnection().also { connection -> connections += connection }
    }
}

private class FakeSshConnection : SshConnection {
    var closes: Int = 0
        private set
    private var connected = true
    val execCommands = mutableListOf<String>()
    val readPaths = mutableListOf<String>()

    val isClosed: Boolean get() = closes > 0

    override val isConnected: Boolean get() = connected

    fun markDead() {
        connected = false
    }

    override suspend fun exec(command: String): SshExecChannel {
        execCommands += command
        return FakeExecChannel("ran:$command")
    }

    override suspend fun readFile(path: String): ByteArray {
        readPaths += path
        return "content:$path".toByteArray(Charsets.UTF_8)
    }

    override suspend fun writeFile(path: String, content: ByteArray) = Unit

    override suspend fun rename(oldPath: String, newPath: String) = Unit

    override suspend fun list(path: String): List<SshFileEntry> = emptyList()

    override suspend fun stat(path: String): SshFileEntry? = null

    override suspend fun mkdir(path: String) = Unit

    override suspend fun remove(path: String) = Unit

    override suspend fun realPath(path: String): String = "/home/gary"

    override fun close() {
        closes += 1
        connected = false
    }
}

private class FakeExecChannel(
    private val output: String,
) : SshExecChannel {
    private val input = ByteArrayOutputStream()

    override val stdin: OutputStream = input
    override val stdout: InputStream = ByteArrayInputStream(output.toByteArray(Charsets.UTF_8))

    override fun stderrText(): String = ""

    override fun isClosed(): Boolean = true

    override suspend fun awaitExit(): Int = 0

    override fun close() {
        input.close()
    }
}

private suspend fun SshExecChannel.stdoutText(): String =
    stdout.bufferedReader().use { reader -> reader.readText() }
