package server.agent.android.events

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
    val onClose: () -> Unit = {},
    val onError: () -> Unit = {},
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

        fun finishError() {
            if (intentionalClose.get()) {
                return
            }
            if (finished.compareAndSet(false, true)) {
                handlers.onError()
            }
        }

        fun finishClose() {
            if (intentionalClose.get()) {
                return
            }
            if (finished.compareAndSet(false, true)) {
                handlers.onClose()
            }
        }

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                queued.forEach { encoded -> webSocket.send(encoded) }
                queued.clear()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val parsed = runCatching {
                    json.decodeFromString(SessionStreamServerMessage.serializer(), text)
                }.getOrElse {
                    finishError()
                    webSocket.cancel()
                    return
                }
                handlers.onMessage(parsed)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(NORMAL_CLOSURE, null)
                if (code == UNAUTHORIZED_CLOSE_CODE && reason == UNAUTHORIZED_CLOSE_REASON) {
                    finishError()
                } else {
                    finishClose()
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (code == UNAUTHORIZED_CLOSE_CODE && reason == UNAUTHORIZED_CLOSE_REASON) {
                    finishError()
                } else {
                    finishClose()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (response?.code == HTTP_UNAUTHORIZED) {
                    finishError()
                } else {
                    finishClose()
                }
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
