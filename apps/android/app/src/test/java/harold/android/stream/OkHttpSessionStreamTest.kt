package harold.android.stream

import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import harold.android.contracts.SessionStreamServerMessage

class OkHttpSessionStreamTest {
    private lateinit var server: MockWebServer
    private lateinit var factory: OkHttpSessionStreamFactory
    private val messages = LinkedBlockingQueue<SessionStreamServerMessage>()
    private val disconnects = LinkedBlockingQueue<DisconnectCause>()
    private val serverSockets = LinkedBlockingQueue<WebSocket>()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        serverSockets += webSocket
                    }
                },
            ),
        )
        server.start()
        factory = OkHttpSessionStreamFactory(client = OkHttpClient())
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun unknownFrameDoesNotEndTheStream() {
        val stream = openStream()
        val serverSocket = awaitServerSocket()

        serverSocket.send("""{"type":"future_frame","payload":{"anything":true}}""")
        serverSocket.send("""{"type":"subscribed","agentId":"cursor","sessionId":"sess_01"}""")

        assertEquals(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
            messages.poll(5, TimeUnit.SECONDS),
        )
        assertTrue("unknown frames must not disconnect", disconnects.isEmpty())
        stream.close()
    }

    @Test
    fun malformedKnownFrameIsATerminalProtocolErrorAndCancels() {
        val stream = openStream()
        val serverSocket = awaitServerSocket()

        serverSocket.send("""{"type":"subscribed","agentId":"cursor"}""")

        val cause = disconnects.poll(5, TimeUnit.SECONDS)
        assertTrue("expected Protocol but was $cause", cause is DisconnectCause.Protocol)

        serverSocket.send("""{"type":"subscribed","agentId":"cursor","sessionId":"sess_01"}""")
        assertNull("cancelled socket must not deliver", messages.poll(500, TimeUnit.MILLISECONDS))
        stream.close()
    }

    private fun openStream(): SessionStream =
        factory.open(
            serverOrigin = server.url("/").toString(),
            handlers = SessionStreamHandlers(
                onMessage = { message -> messages += message },
                onDisconnect = { cause -> disconnects += cause },
            ),
        )

    private fun awaitServerSocket(): WebSocket =
        requireNotNull(serverSockets.poll(5, TimeUnit.SECONDS)) { "server socket never opened" }
}
