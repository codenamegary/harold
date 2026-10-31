package harold.android.live

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import harold.android.contracts.SessionState

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
    fun keepsInterleavedTextAndToolsInInsertionOrder() {
        var state = beginUserTurn(emptyAcpTranscript, turnId = "turn-1", text = "go")
        state = foldAcpUpdate(state, ParsedAcpUpdate.AgentMessageChunk("first"))
        state = foldAcpUpdate(state, ParsedAcpUpdate.ToolCall(
            toolCallId = "t1",
            toolName = "read",
            toolKind = harold.android.contracts.ToolKind.Read,
            status = harold.android.contracts.ToolCallStatus.InProgress,
        ))
        state = foldAcpUpdate(state, ParsedAcpUpdate.AgentMessageChunk("second"))

        assertEquals(
            listOf(
                "TranscriptUserRow",
                "TranscriptAssistantRow",
                "TranscriptToolRow",
                "TranscriptAssistantRow",
            ),
            state.rows.map { it::class.simpleName },
        )
        assertEquals("first", (state.rows[1] as TranscriptAssistantRow).text)
        assertEquals("second", (state.rows[3] as TranscriptAssistantRow).text)
    }

    @Test
    fun keepsThinkingInOrderAcrossAToolCall() {
        var state = beginUserTurn(emptyAcpTranscript, turnId = "turn-1", text = "go")
        state = foldAcpUpdate(state, ParsedAcpUpdate.AgentThoughtChunk("planning"))
        state = foldAcpUpdate(state, ParsedAcpUpdate.ToolCall(
            toolCallId = "t1",
            toolName = "read",
            toolKind = harold.android.contracts.ToolKind.Read,
            status = harold.android.contracts.ToolCallStatus.InProgress,
        ))
        state = foldAcpUpdate(state, ParsedAcpUpdate.AgentThoughtChunk("checking"))

        assertEquals(
            listOf(
                "TranscriptUserRow",
                "TranscriptThinkingRow",
                "TranscriptToolRow",
                "TranscriptThinkingRow",
            ),
            state.rows.map { it::class.simpleName },
        )
    }

    @Test
    fun startsANewSegmentAfterAPermissionPrompt() {
        var state = beginUserTurn(emptyAcpTranscript, turnId = "turn-1", text = "go")
        state = foldAcpUpdate(state, ParsedAcpUpdate.AgentMessageChunk("before"))
        state = applyPermissionRequested(state)
        state = foldAcpUpdate(state, ParsedAcpUpdate.AgentMessageChunk("after"))

        assertEquals(3, state.rows.size)
        assertEquals("before", (state.rows[1] as TranscriptAssistantRow).text)
        assertEquals("after", (state.rows[2] as TranscriptAssistantRow).text)
    }

    @Test
    fun startsANewSegmentInANewTurn() {
        var state = beginUserTurn(emptyAcpTranscript, turnId = "turn-1", text = "first")
        state = foldAcpUpdate(state, ParsedAcpUpdate.AgentMessageChunk("one"))
        state = beginUserTurn(state, turnId = "turn-2", text = "second")
        state = foldAcpUpdate(state, ParsedAcpUpdate.AgentMessageChunk("two"))

        assertEquals(
            listOf(
                "TranscriptUserRow",
                "TranscriptAssistantRow",
                "TranscriptUserRow",
                "TranscriptAssistantRow",
            ),
            state.rows.map { it::class.simpleName },
        )
        assertEquals("two", (state.rows[3] as TranscriptAssistantRow).text)
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
