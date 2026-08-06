package server.agent.android.events

import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

private const val UNAUTHORIZED_CLOSE_CODE = 1008
private const val UNAUTHORIZED_CLOSE_REASON = "unauthorized"
private const val NORMAL_CLOSURE = 1000
private const val HTTP_UNAUTHORIZED = 401

/**
 * Authenticates on the HTTP Upgrade, the way ADR-0001 says non-browser clients
 * should. There is no `auth` first-message frame here, and no credential in the URL.
 */
class OkHttpEventStream(
    private val client: OkHttpClient,
    private val serverOrigin: String,
    private val decoder: EventDecoder = EventDecoder(),
) : EventStream {
    override fun connect(cursor: String, sessionId: String?): Flow<StreamEvent> = callbackFlow {
        val finished = AtomicBoolean(false)

        fun finish(cause: DisconnectCause) {
            if (finished.compareAndSet(false, true)) {
                trySend(StreamEvent.Closed(cause))
                close()
            }
        }

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                trySend(StreamEvent.Open)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                decoder.decode(text).fold(
                    onSuccess = { frame -> trySend(StreamEvent.Frame(frame)) },
                    onFailure = { error ->
                        finish(DisconnectCause.Protocol(error.message ?: "Malformed event frame"))
                        webSocket.cancel()
                    },
                )
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(NORMAL_CLOSURE, null)
                finish(closeCause(code, reason))
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                finish(closeCause(code, reason))
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                finish(failureCause(t, response))
            }
        }

        val socket = client.newWebSocket(
            Request.Builder().url(eventStreamUrl(serverOrigin, cursor, sessionId)).build(),
            listener,
        )

        awaitClose { socket.cancel() }
    }
}

private fun closeCause(code: Int, reason: String): DisconnectCause =
    if (code == UNAUTHORIZED_CLOSE_CODE && reason == UNAUTHORIZED_CLOSE_REASON) {
        DisconnectCause.Unauthorized(detail = reason)
    } else {
        DisconnectCause.Retryable(message = reason.ifBlank { "closed with code $code" })
    }

private fun failureCause(cause: Throwable, response: Response?): DisconnectCause =
    if (response?.code == HTTP_UNAUTHORIZED) {
        DisconnectCause.Unauthorized(detail = null)
    } else {
        DisconnectCause.Retryable(message = cause.message ?: "Event stream failed")
    }
