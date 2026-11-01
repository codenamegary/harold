package harold.android.live

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind

class AcpUpdateTest {
    @Test
    fun readsNestedAgentMessageChunkText() {
        val parsed = parseAcpUpdate(
            JsonObject(
                mapOf(
                    "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
                    "content" to JsonObject(
                        mapOf(
                            "type" to JsonPrimitive("text"),
                            "text" to JsonPrimitive("Hello"),
                        ),
                    ),
                ),
            ),
        )

        assertEquals(ParsedAcpUpdate.AgentMessageChunk("Hello"), parsed)
    }

    @Test
    fun readsToolCallAndUpdate() {
        val started = parseAcpUpdate(
            JsonObject(
                mapOf(
                    "sessionUpdate" to JsonPrimitive("tool_call"),
                    "toolCallId" to JsonPrimitive("tool-1"),
                    "title" to JsonPrimitive("read_file"),
                    "kind" to JsonPrimitive("read"),
                    "status" to JsonPrimitive("pending"),
                ),
            ),
        )
        assertEquals(
            ParsedAcpUpdate.ToolCall(
                toolCallId = "tool-1",
                toolName = "read_file",
                toolKind = ToolKind.Read,
                status = ToolCallStatus.Pending,
            ),
            started,
        )

        val updated = parseAcpUpdate(
            JsonObject(
                mapOf(
                    "sessionUpdate" to JsonPrimitive("tool_call_update"),
                    "toolCallId" to JsonPrimitive("tool-1"),
                    "status" to JsonPrimitive("completed"),
                ),
            ),
        )
        assertEquals(
            ParsedAcpUpdate.ToolCallUpdate(
                toolCallId = "tool-1",
                status = ToolCallStatus.Completed,
            ),
            updated,
        )
    }

    @Test
    fun ignoresUnknownUpdateKinds() {
        assertEquals(
            ParsedAcpUpdate.Ignored,
            parseAcpUpdate(
                JsonObject(mapOf("sessionUpdate" to JsonPrimitive("some_future_update"))),
            ),
        )
    }

    @Test
    fun readsUsageUpdateWithCost() {
        val parsed = parseAcpUpdate(
            JsonObject(
                mapOf(
                    "sessionUpdate" to JsonPrimitive("usage_update"),
                    "used" to JsonPrimitive(84200),
                    "size" to JsonPrimitive(200000),
                    "cost" to JsonObject(
                        mapOf(
                            "amount" to JsonPrimitive(0.045),
                            "currency" to JsonPrimitive("USD"),
                        ),
                    ),
                ),
            ),
        )

        assertEquals(
            ParsedAcpUpdate.Usage(
                used = 84200,
                size = 200000,
                cost = UsageCost(amount = 0.045, currency = "USD"),
            ),
            parsed,
        )
    }

    @Test
    fun readsUsageUpdateWithoutCost() {
        val parsed = parseAcpUpdate(
            JsonObject(
                mapOf(
                    "sessionUpdate" to JsonPrimitive("usage_update"),
                    "used" to JsonPrimitive(1000),
                    "size" to JsonPrimitive(200000),
                ),
            ),
        )

        assertEquals(
            ParsedAcpUpdate.Usage(used = 1000, size = 200000, cost = null),
            parsed,
        )
    }

    @Test
    fun ignoresUsageUpdateWithoutSize() {
        assertEquals(
            ParsedAcpUpdate.Ignored,
            parseAcpUpdate(
                JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("usage_update"),
                        "used" to JsonPrimitive(1000),
                    ),
                ),
            ),
        )
    }

    @Test
    fun sessionInfoUpdatesNeverReachTheTranscript() {
        // Titles arrive as the server's session_info frame, not this raw update.
        assertEquals(
            ParsedAcpUpdate.Ignored,
            parseAcpUpdate(
                JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("session_info_update"),
                        "title" to JsonPrimitive("Named by the agent"),
                    ),
                ),
            ),
        )
    }
}
