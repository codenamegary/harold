package server.agent.android.events

import kotlinx.serialization.json.Json
import server.agent.android.contracts.AgentServerJson
import server.agent.android.contracts.EventFrame
import server.agent.android.contracts.EventFrameSerializer

class EventDecoder(
    private val json: Json = AgentServerJson,
) {
    fun decode(text: String): Result<EventFrame> = runCatching {
        val frame = json.decodeFromString(EventFrameSerializer, text)

        require(frame.isNotEmpty()) { "Event frame is empty" }
        require(frame.size <= MAX_FRAME_SIZE) { "Event frame exceeds $MAX_FRAME_SIZE events" }
        frame.forEach { envelope ->
            require(CURSOR_PATTERN.matches(envelope.cursor)) {
                "Event cursor is not a canonical integer"
            }
        }

        frame
    }

    private companion object {
        const val MAX_FRAME_SIZE = 500
        val CURSOR_PATTERN = Regex("^(0|[1-9][0-9]*)$")
    }
}
