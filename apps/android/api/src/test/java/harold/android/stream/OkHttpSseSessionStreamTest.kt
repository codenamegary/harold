package harold.android.stream

import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import harold.android.contracts.SessionStreamServerMessage

class OkHttpSseSessionStreamTest {
    private lateinit var server: MockWebServer
    private val messages = LinkedBlockingQueue<SessionStreamServerMessage>()
    private val cursors = LinkedBlockingQueue<String?>()
    private val disconnects = LinkedBlockingQueue<DisconnectCause>()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun deliversEventsIgnoresHeartbeatsAndToleratesUnknownFrames() {
        server.enqueue(eventStreamResponse(SSE_EVENTS_WITH_HEARTBEAT_AND_UNKNOWN_FRAME))
        val stream = openStream()

        assertEquals(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
            messages.poll(5, TimeUnit.SECONDS),
        )

        // The body ends right after, so the stream disconnects as retryable.
        val cause = disconnects.poll(5, TimeUnit.SECONDS)
        assertTrue("expected Retryable but was $cause", cause is DisconnectCause.Retryable)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/v1/sessions/sess_01/events?agentId=cursor", recorded.path)
        assertEquals("text/event-stream", recorded.getHeader("Accept"))
        stream.close()
    }

    @Test
    fun deliversTheSseIdAsTheResumeCursor() {
        server.enqueue(eventStreamResponse("id: epoch:7\ndata: {\"type\":\"subscribed\",\"agentId\":\"cursor\",\"sessionId\":\"sess_01\"}\n\n"))
        val stream = openStream()

        messages.poll(5, TimeUnit.SECONDS)
        assertEquals("epoch:7", cursors.poll(5, TimeUnit.SECONDS))
        stream.close()
    }

    @Test
    fun sendsTheLastEventIdWhenResuming() {
        server.enqueue(eventStreamResponse("data: {\"type\":\"subscribed\",\"agentId\":\"cursor\",\"sessionId\":\"sess_01\"}\n\n"))
        val stream = openStream(lastEventId = "epoch:7")

        messages.poll(5, TimeUnit.SECONDS)
        val recorded = server.takeRequest()
        assertEquals("epoch:7", recorded.getHeader("Last-Event-ID"))
        stream.close()
    }

    @Test
    fun recordsTheLastFrameTimeIncludingHeartbeats() {
        server.enqueue(eventStreamResponse(": ping\n\n"))
        val stream = openStream()

        val startedAt = System.nanoTime()
        while (stream.lastFrameAtNanos() == null && System.nanoTime() - startedAt < 5_000_000_000L) {
            Thread.sleep(5)
        }
        assertTrue(stream.lastFrameAtNanos() != null)
        stream.close()
    }

    @Test
    fun malformedKnownFrameIsATerminalProtocolError() {
        server.enqueue(eventStreamResponse("""data: {"type":"subscribed","agentId":"cursor"}


"""))
        val stream = openStream()

        val cause = disconnects.poll(5, TimeUnit.SECONDS)
        assertTrue("expected Protocol but was $cause", cause is DisconnectCause.Protocol)
        assertNull("malformed frame must not deliver a message", messages.poll(500, TimeUnit.MILLISECONDS))
        stream.close()
    }

    @Test
    fun http401MapsToUnauthorized() {
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody("""{"type":"https://harold.local/problems/unauthorized","title":"Unauthorized","status":401}"""),
        )
        val stream = openStream()

        val cause = disconnects.poll(5, TimeUnit.SECONDS)
        assertTrue("expected Unauthorized but was $cause", cause is DisconnectCause.Unauthorized)
        stream.close()
    }

    @Test
    fun silencePastTheIdleWindowDisconnectsAsRetryable() {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.STALL_SOCKET_AT_START))
        val stream = openStream(idleTimeoutMillis = 300)

        val cause = disconnects.poll(5, TimeUnit.SECONDS)
        assertTrue("expected Retryable but was $cause", cause is DisconnectCause.Retryable)
        stream.close()
    }

    private fun openStream(
        idleTimeoutMillis: Long = OkHttpSseSessionStreamFactory.DEFAULT_IDLE_TIMEOUT_MS,
        lastEventId: String? = null,
    ): SessionStream =
        OkHttpSseSessionStreamFactory(
            client = OkHttpClient(),
            idleTimeoutMillis = idleTimeoutMillis,
        ).open(
            serverOrigin = server.url("/").toString(),
            agentId = "cursor",
            sessionId = "sess_01",
            lastEventId = lastEventId,
            handlers = SessionStreamHandlers(
                onMessage = { message, cursor ->
                    messages += message
                    cursors += cursor
                },
                onDisconnect = { cause -> disconnects += cause },
            ),
        )

    private fun eventStreamResponse(body: String): MockResponse =
        MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "text/event-stream")
            .setBody(body)

    private companion object {
        // trimIndent swallows the trailing blank line, so the event
        // terminator is appended explicitly — a stream that ends without it
        // never dispatches its last event.
        val SSE_EVENTS_WITH_HEARTBEAT_AND_UNKNOWN_FRAME = (
            """
            : ping

            data: {"type":"future_frame","payload":{"anything":true}}

            data: {"type":"subscribed","agentId":"cursor","sessionId":"sess_01"}
            """.trimIndent()
            ) + "\n\n"
    }
}
