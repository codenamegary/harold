package harold.android.stream

import java.io.IOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import harold.android.contracts.AgentId
import harold.android.contracts.SessionStreamServerMessage

private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_FORBIDDEN = 403

data class SessionStreamHandlers(
    val onMessage: (SessionStreamServerMessage) -> Unit,
    val onOpen: () -> Unit = {},
    val onDisconnect: (DisconnectCause) -> Unit = {},
)

/** A read-only server-sent-events stream for one session. */
interface SessionStream {
    fun close()
}

fun interface SessionStreamFactory {
    /**
     * Opens `GET /v1/sessions/:sessionId/events?agentId=…`. Opening the
     * stream is the subscribe: the server replays the session and sends
     * `subscribed` last. Changing the watched session means closing this
     * stream and opening another.
     */
    fun open(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        handlers: SessionStreamHandlers,
    ): SessionStream
}

/**
 * Plain streaming OkHttp call over the authenticated client — no
 * `okhttp-sse`, whose built-in reconnect would fight the owner's
 * [ReconnectPolicy]. Lines are read one at a time and fed to
 * [SseEventParser]; `: comment` heartbeats never dispatch.
 *
 * Disconnect mapping: HTTP 401/403 → [DisconnectCause.Unauthorized]; no
 * bytes for [idleTimeoutMillis] (headers included) →
 * [DisconnectCause.Retryable]; stream end → [DisconnectCause.Retryable]
 * (reconnect, and a following 401 becomes Unauthorized, preserving revoke
 * behavior); a malformed known frame → terminal
 * [DisconnectCause.Protocol].
 */
class OkHttpSseSessionStreamFactory(
    private val client: OkHttpClient,
    private val frameDecoder: ServerFrameDecoder = ServerFrameDecoder(),
    private val idleTimeoutMillis: Long = DEFAULT_IDLE_TIMEOUT_MS,
) : SessionStreamFactory {
    override fun open(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        handlers: SessionStreamHandlers,
    ): SessionStream {
        val finished = AtomicBoolean(false)
        val intentionalClose = AtomicBoolean(false)

        fun finish(cause: DisconnectCause) {
            if (intentionalClose.get()) {
                return
            }
            if (finished.compareAndSet(false, true)) {
                handlers.onDisconnect(cause)
            }
        }

        val url = sessionEventsUrl(serverOrigin, agentId, sessionId)
        if (url == null) {
            finish(DisconnectCause.Retryable("invalid server origin"))
            return object : SessionStream {
                override fun close() = Unit
            }
        }

        // The idle window is the only deadline. OkHttp's 10 s default read
        // timeout would kill a quiet SSE stream (heartbeats every ~25 s) long
        // before the watchdog fires, so it is replaced wholesale.
        val streamClient = client.newBuilder()
            .readTimeout(idleTimeoutMillis, TimeUnit.MILLISECONDS)
            .build()
        val request = Request.Builder()
            .url(url)
            .header("Accept", "text/event-stream")
            .build()
        val call = streamClient.newCall(request)

        thread(name = "harold-sse-stream", isDaemon = true) {
            try {
                call.execute().use { response ->
                    when {
                        response.code == HTTP_UNAUTHORIZED || response.code == HTTP_FORBIDDEN ->
                            finish(DisconnectCause.Unauthorized(detail = null))

                        !response.isSuccessful ->
                            finish(DisconnectCause.Retryable("HTTP ${response.code}"))

                        else -> readEvents(response, call, handlers, ::finish)
                    }
                }
            } catch (error: Throwable) {
                finish(disconnectCauseFor(error))
            }
        }

        return object : SessionStream {
            override fun close() {
                intentionalClose.set(true)
                call.cancel()
            }
        }
    }

    private fun readEvents(
        response: Response,
        call: Call,
        handlers: SessionStreamHandlers,
        finish: (DisconnectCause) -> Unit,
    ) {
        handlers.onOpen()
        val source = response.body?.source()
        if (source == null) {
            finish(DisconnectCause.Retryable("stream had no body"))
            return
        }
        val parser = SseEventParser()
        while (true) {
            val line = try {
                source.readUtf8Line()
            } catch (error: IOException) {
                finish(disconnectCauseFor(error))
                return
            }
            if (line == null) {
                finish(DisconnectCause.Retryable("stream ended"))
                return
            }
            val data = parser.feed(line) ?: continue
            when (val outcome = frameDecoder.decode(data)) {
                is FrameOutcome.Decoded -> handlers.onMessage(outcome.message)

                is FrameOutcome.UnknownFrame -> Unit

                is FrameOutcome.MalformedFrame -> {
                    finish(DisconnectCause.Protocol(outcome.detail))
                    call.cancel()
                    return
                }
            }
        }
    }

    private fun disconnectCauseFor(error: Throwable): DisconnectCause = when (error) {
        is SocketTimeoutException ->
            DisconnectCause.Retryable("no bytes for $idleTimeoutMillis ms")
        else ->
            DisconnectCause.Retryable(error.message ?: "session stream failed")
    }

    companion object {
        /**
         * Three server heartbeat windows (the daemon pings every 25 s): one
         * lost ping must not kill a healthy stream, a dead one is detected
         * within a minute.
         */
        const val DEFAULT_IDLE_TIMEOUT_MS = 75_000L
    }
}
