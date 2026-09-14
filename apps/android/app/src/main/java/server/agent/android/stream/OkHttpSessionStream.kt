package server.agent.android.stream

import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import server.agent.android.contracts.AgentServerJson
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage

private const val UNAUTHORIZED_CLOSE_CODE = 1008
private const val UNAUTHORIZED_CLOSE_REASON = "unauthorized"
private const val NORMAL_CLOSURE = 1000
private const val HTTP_UNAUTHORIZED = 401

data class SessionStreamHandlers(
    val onMessage: (SessionStreamServerMessage) -> Unit,
    val onOpen: () -> Unit = {},
    val onDisconnect: (DisconnectCause) -> Unit = {},
)

interface SessionStream {
    fun send(message: SessionStreamClientMessage)
    fun close()
}

fun interface SessionStreamFactory {
    fun open(serverOrigin: String, handlers: SessionStreamHandlers): SessionStream
}

class OkHttpSessionStreamFactory(
    private val client: OkHttpClient,
    private val json: Json = AgentServerJson,
) : SessionStreamFactory {
    override fun open(serverOrigin: String, handlers: SessionStreamHandlers): SessionStream {
        val finished = AtomicBoolean(false)
        val intentionalClose = AtomicBoolean(false)
        val queued = mutableListOf<String>()
        var socket: WebSocket? = null

        fun finish(cause: DisconnectCause) {
            if (intentionalClose.get()) {
                return
            }
            if (finished.compareAndSet(false, true)) {
                handlers.onDisconnect(cause)
            }
        }

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                handlers.onOpen()
                queued.forEach { encoded -> webSocket.send(encoded) }
                queued.clear()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val parsed = runCatching {
                    json.decodeFromString(SessionStreamServerMessage.serializer(), text)
                }.getOrElse { error ->
                    finish(DisconnectCause.Protocol(error.message ?: "unknown type"))
                    webSocket.cancel()
                    return
                }
                handlers.onMessage(parsed)
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

        socket = client.newWebSocket(
            Request.Builder().url(sessionStreamUrl(serverOrigin)).build(),
            listener,
        )

        return object : SessionStream {
            override fun send(message: SessionStreamClientMessage) {
                val encoded = json.encodeToString(SessionStreamClientMessage.serializer(), message)
                val openSocket = socket
                if (openSocket != null && queued.isEmpty()) {
                    val sent = openSocket.send(encoded)
                    if (!sent) {
                        queued += encoded
                    }
                    return
                }
                queued += encoded
            }

            override fun close() {
                intentionalClose.set(true)
                socket?.cancel()
            }
        }
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
        DisconnectCause.Retryable(message = cause.message ?: "Session stream failed")
    }
