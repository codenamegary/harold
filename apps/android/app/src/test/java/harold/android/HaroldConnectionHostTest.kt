package harold.android

import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentReference
import harold.android.contracts.ConfigOption
import harold.android.live.SessionOwner
import harold.android.live.SessionSnapshot
import harold.android.session.HaroldConnection
import harold.android.session.HaroldConnections
import harold.android.session.PairedState
import harold.android.stream.ConnectionState
import harold.android.testing.FakeSessionGateway
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
        val host = host(owner, connections)

        host.onAppForeground()
        runCurrent()

        assertEquals(1, connections.foregrounds)
        assertEquals(listOf(ORIGIN), owner.connects)
        assertEquals(1, owner.foregrounds)
        assertEquals(0, owner.backgroundCloses)
    }

    @Test
    fun backgroundClosesTheFocusedStreamWhenNoSessionIsLive() = runTest {
        val owner = RecordingSessionOwner()
        val connections = RecordingConnections(stay = false)
        val host = host(owner, connections)

        host.onAppBackground()

        assertEquals(1, connections.backgrounds)
        assertEquals(1, owner.backgroundCloses)
        assertEquals(0, owner.backgrounds)
    }

    @Test
    fun backgroundKeepsTheFocusedStreamWhenASessionIsLive() = runTest {
        val owner = RecordingSessionOwner()
        val connections = RecordingConnections(stay = true)
        val host = host(owner, connections)

        host.onAppBackground()

        assertEquals(1, connections.backgrounds)
        assertEquals(0, owner.backgroundCloses)
        assertEquals(1, owner.backgrounds)
    }

    private fun TestScope.host(
        owner: RecordingSessionOwner,
        connections: RecordingConnections,
    ): HaroldConnectionHost = HaroldConnectionHost(
        connections = connections,
        sessionGateway = FakeSessionGateway(PairedState.Paired(ORIGIN, "device_01", "Pixel")),
        sessionOwner = owner,
        scope = backgroundScope,
    )
}

private class RecordingConnections(
    private val stay: Boolean,
) : HaroldConnections {
    var foregrounds = 0
        private set
    var backgrounds = 0
        private set

    override val connections: StateFlow<List<HaroldConnection>> =
        MutableStateFlow(emptyList())

    override fun onForeground() {
        foregrounds += 1
    }

    override fun onBackground() {
        backgrounds += 1
    }

    override suspend fun refresh() = Unit

    override fun setSessionStates(
        serverOrigin: String,
        states: List<harold.android.contracts.SessionState>,
    ) = Unit

    override fun shouldStayConnected(serverOrigin: String): Boolean = stay
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

    override fun connect(serverOrigin: String) {
        connects += serverOrigin
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
