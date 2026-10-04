package harold.android.contracts

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AvailableCommandsTest {
    @Test
    fun parsesCommandsUpdateWithHints() {
        val update = Json.parseToJsonElement(
            """
            {
              "sessionUpdate": "available_commands_update",
              "availableCommands": [
                {"name": "plan", "description": "Draft a plan"},
                {"name": "search", "description": "Search the web", "input": {"hint": "query"}}
              ]
            }
            """.trimIndent(),
        )

        val commands = parseAvailableCommands(update)

        assertEquals(
            listOf(
                AvailableCommand(name = "plan", description = "Draft a plan"),
                AvailableCommand(name = "search", description = "Search the web", hint = "query"),
            ),
            commands,
        )
    }

    @Test
    fun parsesEmptyCommandList() {
        val update = Json.parseToJsonElement(
            """{"sessionUpdate": "available_commands_update", "availableCommands": []}""",
        )

        val commands = parseAvailableCommands(update)

        assertTrue(commands != null && commands.isEmpty())
    }

    @Test
    fun returnsNullForOtherUpdateKinds() {
        val update = Json.parseToJsonElement(
            """{"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "hi"}}""",
        )

        assertNull(parseAvailableCommands(update))
    }

    @Test
    fun returnsNullForMalformedCommands() {
        assertNull(
            parseAvailableCommands(
                Json.parseToJsonElement(
                    """{"sessionUpdate": "available_commands_update", "availableCommands": [{"name": ""}]}""",
                ),
            ),
        )
        assertNull(
            parseAvailableCommands(
                Json.parseToJsonElement(
                    """{"sessionUpdate": "available_commands_update", "availableCommands": [{"description": "x"}]}""",
                ),
            ),
        )
        assertNull(
            parseAvailableCommands(
                Json.parseToJsonElement(
                    """{"sessionUpdate": "available_commands_update"}""",
                ),
            ),
        )
        assertNull(parseAvailableCommands(Json.parseToJsonElement(""""just a string"""")))
    }
}
