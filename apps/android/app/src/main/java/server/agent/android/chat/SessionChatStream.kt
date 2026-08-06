package server.agent.android.chat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import server.agent.android.contracts.EventEnvelope
import server.agent.android.events.DisconnectCause
import server.agent.android.events.EventStreamFactory
import server.agent.android.events.StreamEvent

private const val SESSION_STREAM_RECONNECT_DELAY_MS = 250L

/**
 * Owns one session-scoped event stream. Clears local projection and replays from
 * cursor zero after every reconnect, matching the web client.
 */
interface SessionEventSource {
    fun observe(
        serverOrigin: String,
        sessionId: String,
        onReconnect: () -> Unit,
        onEvents: (List<EventEnvelope>) -> Unit,
    ): Job
}

class SessionChatStream(
    private val streamFactory: EventStreamFactory,
    private val scope: CoroutineScope,
) : SessionEventSource {
    override fun observe(
        serverOrigin: String,
        sessionId: String,
        onReconnect: () -> Unit,
        onEvents: (List<EventEnvelope>) -> Unit,
    ): Job = scope.launch {
        val stream = streamFactory.create(serverOrigin)
        var cursor = "0"

        while (isActive) {
            var shouldReconnect = false

            stream.connect(cursor = cursor, sessionId = sessionId).collect { event ->
                when (event) {
                    is StreamEvent.Open -> Unit
                    is StreamEvent.Frame -> {
                        onEvents(event.frame)
                        event.frame.lastOrNull()?.cursor?.let { lastCursor ->
                            cursor = lastCursor
                        }
                    }
                    is StreamEvent.Closed -> {
                        if (event.cause is DisconnectCause.Unauthorized) {
                            return@collect
                        }
                        shouldReconnect = true
                    }
                }
            }

            if (!shouldReconnect || !isActive) {
                return@launch
            }

            onReconnect()
            cursor = "0"
            delay(SESSION_STREAM_RECONNECT_DELAY_MS)
        }
    }
}
