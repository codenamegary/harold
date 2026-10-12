package harold.android.contracts

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionInfoTest {
    @Test
    fun parsesATitleUpdate() {
        val update = Json.parseToJsonElement(
            """{"sessionUpdate": "session_info_update", "title": "Fix the auth flow"}""",
        )

        assertEquals(
            ParsedSessionInfoUpdate.Title("Fix the auth flow"),
            parseSessionInfoUpdate(update),
        )
    }

    @Test
    fun parsesANullTitleAsAClear() {
        val update = Json.parseToJsonElement(
            """{"sessionUpdate": "session_info_update", "title": null}""",
        )

        assertEquals(ParsedSessionInfoUpdate.Title(null), parseSessionInfoUpdate(update))
    }

    @Test
    fun parsesAMissingTitleAsAMarker() {
        val update = Json.parseToJsonElement(
            """{"sessionUpdate": "session_info_update", "_meta": {"marker": "retry"}}""",
        )

        assertEquals(ParsedSessionInfoUpdate.Marker, parseSessionInfoUpdate(update))
    }

    @Test
    fun parsesANonStringTitleAsAMarker() {
        val update = Json.parseToJsonElement(
            """{"sessionUpdate": "session_info_update", "title": 42}""",
        )

        assertEquals(ParsedSessionInfoUpdate.Marker, parseSessionInfoUpdate(update))
    }

    @Test
    fun returnsNullForOtherUpdateKinds() {
        val update = Json.parseToJsonElement(
            """{"sessionUpdate": "agent_message_chunk", "text": "hi"}""",
        )

        assertNull(parseSessionInfoUpdate(update))
    }

    @Test
    fun returnsNullForNonObjectUpdates() {
        assertNull(parseSessionInfoUpdate(Json.parseToJsonElement("""["nope"]""")))
    }
}
