package harold.android.di

import harold.android.acp.AcpSessionCatalog
import harold.android.acp.AgentRuntime
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessChannel
import harold.android.process.AgentProcessLauncher
import harold.android.process.LaunchableAgent
import harold.android.process.SessionFileService
import harold.android.process.TerminalLaunchSpec
import harold.android.testing.FakeConnectionStore
import harold.android.transport.ssh.SshConnectionLease
import harold.android.transport.ssh.SshConnectionPool
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DefaultConnectionResourcesTest {
    @Test
    fun removingOneOfTwoRowsSharingAKeyLeavesTheResourcesAlone() = runTest {
        val first = saved("row-one")
        val second = saved("row-two")
        val store = FakeConnectionStore(first)
        store.save(second)
        val pool = RecordingPool(mapOf(first.connectionId to KEY, second.connectionId to KEY))
        val resources = resources(store, pool)

        resources.closeConnection(first.connectionId)

        assertTrue(pool.closed.isEmpty())
    }

    @Test
    fun removingTheLastRowClosesThePoolEntry() = runTest {
        val only = saved("row-one")
        val store = FakeConnectionStore(only)
        val pool = RecordingPool(mapOf(only.connectionId to KEY))
        val resources = resources(store, pool)

        store.remove(only.connectionId)
        resources.closeConnection(only.connectionId)

        assertEquals(listOf(only.connectionId), pool.closed)
    }

    private fun resources(
        store: FakeConnectionStore,
        pool: RecordingPool,
    ): DefaultConnectionResources {
        val runtime = AgentRuntime(
            launcher = NoopLauncher,
            files = NoopFiles,
            catalog = AcpSessionCatalog(),
        )
        val repository = ConnectionRepository(store)
        return DefaultConnectionResources(
            agentRuntime = dagger.Lazy { runtime },
            connectionPool = dagger.Lazy { pool },
            connectionRepository = dagger.Lazy { repository },
        )
    }

    private fun saved(connectionId: String): SavedConnection = SavedConnection(
        formatVersion = 3,
        connectionId = connectionId,
        deviceName = "test",
        name = connectionId,
        colorId = "tide",
        iconId = "terminal",
        ssh = SshConfig(
            host = "127.0.0.1",
            port = 22,
            user = "test",
            auth = SshAuth.Password("secret"),
            hostKeyFingerprint = "fingerprint",
        ),
    )

    private companion object {
        const val KEY = "shared-host-key"
    }
}

private object NoopLauncher : AgentProcessLauncher {
    override suspend fun launchableAgents(connectionId: String): Result<List<LaunchableAgent>> =
        Result.success(emptyList())

    override suspend fun keyFor(connectionId: String): String = "shared-host-key"

    override suspend fun launchAgent(
        connectionId: String,
        agentId: String,
    ): Result<AgentProcessChannel> = Result.failure(AgentLaunchException("not used"))

    override suspend fun launchTerminal(
        connectionId: String,
        spec: TerminalLaunchSpec,
    ): Result<AgentProcessChannel> = Result.failure(AgentLaunchException("not used"))
}

private object NoopFiles : SessionFileService {
    override suspend fun readTextFile(connectionId: String, path: String): Result<String> =
        Result.failure(AgentLaunchException("not used"))

    override suspend fun writeTextFile(
        connectionId: String,
        path: String,
        content: String,
    ): Result<Unit> = Result.failure(AgentLaunchException("not used"))
}

private class RecordingPool(
    private val keys: Map<String, String>,
) : SshConnectionPool {
    val closed = mutableListOf<String>()

    override suspend fun acquire(connectionId: String): SshConnectionLease =
        error("not used")

    override suspend fun keyFor(connectionId: String): String =
        keys[connectionId] ?: error("unknown connection: $connectionId")

    override suspend fun close(connectionId: String) {
        closed += connectionId
    }

    override fun closeKey(key: String) = Unit

    override fun closeAll() = Unit

    override fun trimIdle(idleMillis: Long) = Unit
}
