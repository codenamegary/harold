package server.agent.android.events

import kotlinx.coroutines.flow.Flow
import server.agent.android.contracts.EventFrame

sealed interface StreamEvent {
    data object Open : StreamEvent

    data class Frame(
        val frame: EventFrame,
    ) : StreamEvent

    data class Closed(
        val cause: DisconnectCause,
    ) : StreamEvent
}

interface EventStream {
    /**
     * Opens a fresh socket per call and emits until it closes. Reconnecting means
     * calling this again with the last applied cursor, never reusing a dead socket.
     */
    fun connect(cursor: String): Flow<StreamEvent>
}

fun interface EventStreamFactory {
    fun create(serverOrigin: String): EventStream
}

fun eventStreamUrl(serverOrigin: String, cursor: String): String {
    val origin = serverOrigin.trim().trimEnd('/')
    val socketOrigin = when {
        origin.startsWith("https://") -> "wss://${origin.removePrefix("https://")}"
        origin.startsWith("http://") -> "ws://${origin.removePrefix("http://")}"
        else -> origin
    }

    return "$socketOrigin/v1/events?cursor=$cursor"
}
