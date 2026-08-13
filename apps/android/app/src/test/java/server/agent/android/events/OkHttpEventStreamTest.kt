package server.agent.android.events

import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.network.BearerAuthInterceptor

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class OkHttpEventStreamTest {
    private lateinit var server: MockWebServer
    private lateinit var client: OkHttpClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = OkHttpClient.Builder()
            .addInterceptor(BearerAuthInterceptor { "devcred_test_secret" })
            .build()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun derivesWebSocketSchemeFromTheServerOrigin() {
        assertEquals(
            "ws://127.0.0.1:8787/v1/sessions/stream",
            eventStreamUrl("http://127.0.0.1:8787", "0"),
        )
        assertEquals(
            "wss://agent.example/v1/sessions/stream",
            eventStreamUrl("https://agent.example/", "42"),
        )
    }

    @Test
    fun includesSessionIdWhenProvided() {
        assertEquals(
            "ws://127.0.0.1:8787/v1/sessions/stream",
            eventStreamUrl("http://127.0.0.1:8787", "0", "sess_01"),
        )
    }

    @Test
    fun coldStartsAtCursorZeroWithBearerOnTheUpgrade() {
        enqueueSocket { socket -> socket.close(1000, "done") }

        collect(cursor = START_CURSOR)

        val upgrade = server.takeRequest()
        assertEquals("/v1/sessions/stream", upgrade.path)
        assertEquals("Bearer devcred_test_secret", upgrade.getHeader("Authorization"))
        assertEquals("websocket", upgrade.getHeader("Upgrade")?.lowercase())
    }

    @Test
    fun neverSendsAnAuthFrameOrPutsTheCredentialInTheUrl() {
        val received = mutableListOf<String>()
        enqueueSocket(
            onMessage = { text -> received += text },
        ) { socket -> socket.close(1000, "done") }

        collect(cursor = START_CURSOR)

        val upgrade = server.takeRequest()
        assertTrue(received.isEmpty())
        assertTrue(upgrade.path!!.none { it == '&' })
        assertTrue(!upgrade.path!!.contains("devcred_test_secret"))
    }

    @Test
    fun ignoresCursorInTheSessionStreamUrl() {
        enqueueSocket { socket -> socket.close(1000, "done") }

        collect(cursor = "128")

        assertEquals("/v1/sessions/stream", server.takeRequest().path)
    }

    @Test
    fun emitsOpenAndIgnoresProtocolFrames() {
        enqueueSocket { socket ->
            socket.send("""{"type":"subscribed","agentId":"cursor","sessionId":"sess_01"}""")
            socket.close(1000, "done")
        }

        val events = collect(cursor = START_CURSOR)

        assertEquals(StreamEvent.Open, events.first())
        assertTrue(events.filterIsInstance<StreamEvent.Frame>().isEmpty())
    }

    @Test
    fun mapsUnauthorizedCloseToATerminalCause() {
        enqueueSocket { socket -> socket.close(1008, "unauthorized") }

        assertEquals(DisconnectCause.Unauthorized(detail = "unauthorized"), closeCauseOf(collect()))
    }

    @Test
    fun mapsUnauthorizedUpgradeResponseToATerminalCause() {
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody(
                    """
                    {
                      "type": "https://agent-server.local/problems/unauthorized",
                      "title": "Unauthorized",
                      "status": 401
                    }
                    """.trimIndent(),
                ),
        )

        val cause = closeCauseOf(collect())

        assertTrue("expected unauthorized but was $cause", cause is DisconnectCause.Unauthorized)
    }

    @Test
    fun keepsASlowConsumerCloseRetryable() {
        enqueueSocket { socket -> socket.close(1008, "slow consumer") }

        val cause = closeCauseOf(collect())

        assertTrue("expected retryable but was $cause", cause is DisconnectCause.Retryable)
    }

    @Test
    fun keepsANormalCloseRetryable() {
        enqueueSocket { socket -> socket.close(1001, "going away") }

        val cause = closeCauseOf(collect())

        assertTrue("expected retryable but was $cause", cause is DisconnectCause.Retryable)
    }

    @Test
    fun opensAFreshSocketForEveryConnect() {
        enqueueSocket { socket -> socket.close(1000, "done") }
        enqueueSocket { socket -> socket.close(1000, "done") }

        val stream = eventStream()
        runBlocking { withTimeout(TIMEOUT_MS) { stream.connect(START_CURSOR).toList() } }
        runBlocking { withTimeout(TIMEOUT_MS) { stream.connect("5").toList() } }

        assertEquals("/v1/sessions/stream", server.takeRequest().path)
        assertEquals("/v1/sessions/stream", server.takeRequest().path)
    }

    private fun eventStream(): EventStream =
        OkHttpEventStream(
            client = client,
            serverOrigin = server.url("/").toString().trimEnd('/'),
        )

    private fun collect(cursor: String = START_CURSOR): List<StreamEvent> =
        runBlocking {
            withTimeout(TIMEOUT_MS) { eventStream().connect(cursor).toList() }
        }

    private fun closeCauseOf(events: List<StreamEvent>): DisconnectCause =
        events.filterIsInstance<StreamEvent.Closed>().single().cause

    private fun enqueueSocket(
        onMessage: (String) -> Unit = {},
        onOpen: (WebSocket) -> Unit,
    ) {
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        onOpen(webSocket)
                    }

                    override fun onMessage(webSocket: WebSocket, text: String) {
                        onMessage(text)
                    }
                },
            ),
        )
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L
    }
}
