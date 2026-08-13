package server.agent.android.chat

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import server.agent.android.contracts.SessionState

class AcpTranscriptReducerTest {
    @Test
    fun foldsALiveTurnFromUserPromptAndAcpChunks() {
        val started = beginUserTurn(emptyAcpTranscript, turnId = "turn-1", text = "Explain auth")
        val live = applySubscribed(started)
        val withThought = foldAcpUpdate(
            live,
            parseAcpUpdate(
                JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("agent_thought_chunk"),
                        "text" to JsonPrimitive("thinking"),
                    ),
                ),
            ),
        )
        val withOutput = foldAcpUpdate(
            withThought,
            parseAcpUpdate(
                JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
                        "content" to JsonObject(
                            mapOf(
                                "type" to JsonPrimitive("text"),
                                "text" to JsonPrimitive("Auth uses JWT"),
                            ),
                        ),
                    ),
                ),
            ),
        )
        val idle = applyPromptComplete(withOutput)

        assertEquals(SessionState.Idle, idle.sessionState)
        assertEquals("Explain auth", (idle.rows[0] as TranscriptUserRow).text)
        assertEquals("thinking", (idle.rows[1] as TranscriptThinkingRow).text)
        assertEquals("Auth uses JWT", (idle.rows[2] as TranscriptAssistantRow).text)
    }

    @Test
    fun marksRunningWhenLiveUpdatesArriveAfterSubscribe() {
        val replayed = foldAcpUpdate(
            emptyAcpTranscript,
            parseAcpUpdate(
                JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
                        "text" to JsonPrimitive("history"),
                    ),
                ),
            ),
        )
        val subscribed = applySubscribed(replayed)
        assertEquals(SessionState.Idle, subscribed.sessionState)

        val live = foldAcpUpdate(
            subscribed,
            parseAcpUpdate(
                JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
                        "text" to JsonPrimitive(" more"),
                    ),
                ),
            ),
        )
        assertEquals(SessionState.Running, live.sessionState)
        assertEquals("history more", (live.rows.single() as TranscriptAssistantRow).text)
    }
}
