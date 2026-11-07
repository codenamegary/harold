package harold.android.stream

import harold.android.contracts.AgentId
import harold.android.contracts.SessionStreamServerMessage

data class SessionStreamHandlers(
    val onMessage: (SessionStreamServerMessage, cursor: String?) -> Unit,
    val onOpen: () -> Unit = {},
    val onDisconnect: (DisconnectCause) -> Unit = {},
)

/** A live server-message stream for one session. */
interface SessionStream {
    fun close()

    /**
     * Monotonic timestamp of the last received message (heartbeats included),
     * or null before the first byte. The owner compares it across a background
     * period to tell a surviving connection from one frozen through Doze.
     */
    fun lastFrameAtNanos(): Long?
}

fun interface SessionStreamFactory {
    /**
     * Opens the live stream for one session. Opening the stream is the
     * subscribe: the session replays and sends `subscribed` last. A
     * [lastEventId] asks for only events after that cursor instead of a full
     * replay.
     */
    fun open(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        lastEventId: String?,
        handlers: SessionStreamHandlers,
    ): SessionStream
}
