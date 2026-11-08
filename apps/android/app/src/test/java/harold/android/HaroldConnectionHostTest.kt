package harold.android

import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentReference
import harold.android.contracts.ConfigOption
import harold.android.live.SessionOwner
import harold.android.live.SessionSnapshot
import harold.android.session.ConnectionHealth
import harold.android.session.Connections
import harold.android.session.ActiveConnectionState
import harold.android.stream.ConnectionState
import harold.android.testing.FakeConnectionGateway
import harold.android.transport.ssh.SshConnectionLease
import harold.android.transport.ssh.SshConnectionPool
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HaroldConnectionHostTest {
    @Test
    fun foregroundConnectsTheFocusedHarold() = runTest {
        val owner = RecordingSessionOwner()
        val connections = RecordingConnections(stay = true)
        val pool = RecordingPool()
        val host = host(owner, connections, pool)

        host.onAppForeground()
        runCurrent()

        assertEquals(1, connections.foregrounds)
        assertEquals(listOf(ORIGIN), owner.connects)
        assertEquals(1, owner.foregrounds)
        assertEquals(0, owner.backgroundCloses)
        assertEquals(0, pool.closeAlls)
    }

    @Test
    fun backgroundClosesTheFocusedStreamWhenNoSessionIsLive() = runTest {
        val owner = RecordingSessionOwner()
        val connections = RecordingConnections(stay = false)
        val pool = RecordingPool()
        val host = host(owner, connections, pool)

        host.onAppBackground()

        assertEquals(1, connections.backgrounds)
        assertEquals(1, owner.backgroundCloses)
        assertEquals(0, owner.backgrounds)
        assertEquals(1, pool.closeAlls)
    }

    @Test
    fun backgroundKeepsTheFocusedStreamWhenASessionIsLive() = runTest {
        val owner = RecordingSessionOwner()
        val connections = RecordingConnections(stay = true)
        val pool = RecordingPool()
        val host = host(owner, connections, pool)

        host.onAppBackground()

        assertEquals(1, connections.backgrounds)
        assertEquals(0, owner.backgroundCloses)
        assertEquals(1, owner.backgrounds)
        assertEquals(0, pool.closeAlls)
    }

    private fun TestScope.host(
        owner: RecordingSessionOwner,
        connections: RecordingConnections,
        pool: RecordingPool,
    ): HaroldConnectionHost = HaroldConnectionHost(
        connections = connections,
        connectionGateway = FakeConnectionGateway(ActiveConnectionState.Active(ORIGIN, "Pixel")),
        sessionOwner = owner,
        connectionPool = pool,
        scope = backgroundScope,
    )
}

private class RecordingPool : SshConnectionPool {
    var closeAlls = 0
        private set

    override suspend fun acquire(connectionId: String): SshConnectionLease =
        error("not used")

    override suspend fun keyFor(connectionId: String): String = error("not used")

    override suspend fun close(connectionId: String) = Unit

    override fun closeKey(key: String) = Unit

    override fun closeAll() {
        closeAlls += 1
    }

    override fun trimIdle(idleMillis: Long) = Unit
}

private class RecordingConnections(
    private val stay: Boolean,
) : Connections {
    var foregrounds = 0
        private set
    var backgrounds = 0
        private set

    override val connections: StateFlow<List<ConnectionHealth>> =
        MutableStateFlow(emptyList())

    override fun onForeground() {
        foregrounds += 1
    }

    override fun onBackground() {
        backgrounds += 1
    }

    override suspend fun refresh() = Unit

    override fun setSessionStates(
        connectionId: String,
        states: List<harold.android.contracts.SessionState>,
    ) = Unit

    override fun shouldStayConnected(connectionId: String): Boolean = stay
}

private class RecordingSessionOwner : SessionOwner {
    val connects = mutableListOf<String>()
    var foregrounds = 0
        private set
    var backgrounds = 0
        private set
    var backgroundCloses = 0
        private set

    override val connectionState: StateFlow<ConnectionState> = MutableStateFlow(ConnectionState())
    override val snapshot: StateFlow<SessionSnapshot> = MutableStateFlow(SessionSnapshot())
    override val sessionTitles: StateFlow<Map<String, String>> = MutableStateFlow(emptyMap())
    override val promptCompletions: Flow<Unit> = MutableSharedFlow()

    override fun connect(connectionId: String) {
        connects += connectionId
    }

    override fun retry() = Unit

    override fun disconnect() = Unit

    override fun onBackground() {
        backgrounds += 1
    }

    override fun onForeground() {
        foregrounds += 1
    }

    override fun closeForBackground() {
        backgroundCloses += 1
    }

    override fun watch(agentId: AgentId?, sessionId: String?) = Unit

    override suspend fun prompt(text: String, attachments: List<AttachmentReference>): Result<Unit> =
        Result.success(Unit)

    override suspend fun cancel(): Result<Unit> = Result.success(Unit)

    override suspend fun replyPermission(requestId: String, optionId: String): Result<Unit> =
        Result.success(Unit)

    override suspend fun replyExtension(requestId: String, result: JsonElement): Result<Unit> =
        Result.success(Unit)

    override fun rememberConfig(agentId: AgentId, sessionId: String, configOptions: List<ConfigOption>) = Unit

    override fun forget(agentId: AgentId, sessionId: String) = Unit
}

private const val ORIGIN = "http://laptop.local:3847"
