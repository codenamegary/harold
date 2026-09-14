package server.agent.android.stream

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.SessionStreamServerMessage

class ServerFrameDecoderTest {
    private val decoder = ServerFrameDecoder()

    @Test
    fun decodesEveryKnownServerFrameType() {
        knownFrames().forEach { frame ->
            assertTrue(frame.type, decoder.decode(frame.json) is FrameOutcome.Decoded)
        }

        assertEquals(0, decoder.unknownFrameCount)
    }

    @Test
    fun unknownTypeIsDroppedAndCounted() {
        val outcome = decoder.decode("""{"type":"future_frame","payload":{"anything":true}}""")

        assertEquals(FrameOutcome.UnknownFrame("future_frame"), outcome)
        assertEquals(1, decoder.unknownFrameCount)
    }

    @Test
    fun unknownTypePayloadIsNeverValidated() {
        val outcome = decoder.decode("""{"type":"session_config_v2","agentId":7,"configOptions":[]}""")

        assertEquals(FrameOutcome.UnknownFrame("session_config_v2"), outcome)
        assertEquals(1, decoder.unknownFrameCount)
    }

    @Test
    fun countsEachUnknownFrame() {
        decoder.decode("""{"type":"one"}""")
        decoder.decode("""{"type":"two"}""")
        decoder.decode("""{"type":"one"}""")

        assertEquals(3, decoder.unknownFrameCount)
    }

    @Test
    fun ignoresUnknownKeysInsideKnownFrames() {
        val outcome = decoder.decode(
            """
            {
              "type": "subscribed",
              "agentId": "cursor",
              "sessionId": "sess_01",
              "futureField": { "nested": true }
            }
            """.trimIndent(),
        )

        assertTrue(outcome is FrameOutcome.Decoded)
        assertEquals(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
            (outcome as FrameOutcome.Decoded).message,
        )
    }

    @Test
    fun rejectsFrameThatIsNotJson() {
        assertTrue(decoder.decode("not json") is FrameOutcome.MalformedFrame)
    }

    @Test
    fun rejectsNonObjectRoot() {
        assertTrue(decoder.decode("""["session_update"]""") is FrameOutcome.MalformedFrame)
    }

    @Test
    fun rejectsMissingType() {
        assertTrue(decoder.decode("""{"agentId":"cursor"}""") is FrameOutcome.MalformedFrame)
    }

    @Test
    fun rejectsNonStringType() {
        assertTrue(decoder.decode("""{"type":7}""") is FrameOutcome.MalformedFrame)
    }

    @Test
    fun rejectsKnownTypeWithMissingRequiredField() {
        assertTrue(
            decoder.decode("""{"type":"subscribed","agentId":"cursor"}""") is
                FrameOutcome.MalformedFrame,
        )
    }

    @Test
    fun rejectsKnownTypeWithInvalidRequiredField() {
        assertTrue(
            decoder.decode(
                """{"type":"prompt_complete","agentId":"cursor","sessionId":7}""",
            ) is FrameOutcome.MalformedFrame,
        )
    }

    @Test
    fun malformedFramesDoNotCountAsUnknown() {
        decoder.decode("""{"type":"subscribed"}""")

        assertEquals(0, decoder.unknownFrameCount)
    }
}

private data class KnownFrame(
    val type: String,
    val json: String,
)

private fun knownFrames(): List<KnownFrame> =
    listOf(
        KnownFrame(
            "session_update",
            """{"type":"session_update","agentId":"cursor","sessionId":"sess_01","update":{}}""",
        ),
        KnownFrame(
            "session_config",
            """{"type":"session_config","agentId":"cursor","sessionId":"sess_01","configOptions":[]}""",
        ),
        KnownFrame(
            "subscribed",
            """{"type":"subscribed","agentId":"cursor","sessionId":"sess_01"}""",
        ),
        KnownFrame(
            "permission_request",
            """{"type":"permission_request","requestId":"req_01","agentId":"cursor","sessionId":"sess_01","params":{}}""",
        ),
        KnownFrame(
            "extension_request",
            """{"type":"extension_request","requestId":"req_01","method":"method","agentId":"cursor","sessionId":"sess_01","params":{}}""",
        ),
        KnownFrame(
            "error",
            """{"type":"error","message":"boom"}""",
        ),
        KnownFrame(
            "prompt_complete",
            """{"type":"prompt_complete","agentId":"cursor","sessionId":"sess_01"}""",
        ),
        KnownFrame(
            "cancelled",
            """{"type":"cancelled","agentId":"cursor","sessionId":"sess_01"}""",
        ),
        KnownFrame(
            "auth_session_updated",
            """
            {
              "type": "auth_session_updated",
              "agentId": "cursor",
              "auth": {
                "agentId": "cursor",
                "status": "needs_auth",
                "error": null,
                "session": null
              }
            }
            """.trimIndent(),
        ),
    )
