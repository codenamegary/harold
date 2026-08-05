package server.agent.android.events

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.EventType

class EventDecoderTest {
    private val decoder = EventDecoder()

    @Test
    fun decodesAFrameOfEnvelopes() {
        val frame = decoder.decode(
            """
            [
              {
                "type": "device.connected",
                "cursor": "7",
                "occurredAt": "2026-08-05T00:00:00.000Z",
                "payload": { "deviceId": "device_01" }
              }
            ]
            """.trimIndent(),
        ).getOrThrow()

        assertEquals(EventType.DeviceConnected, frame.single().type)
        assertEquals("7", frame.single().cursor)
    }

    @Test
    fun rejectsAnEmptyFrame() {
        assertTrue(decoder.decode("[]").isFailure)
    }

    @Test
    fun rejectsAFrameLargerThanTheContractMaximum() {
        val events = (1..501).joinToString(",") { cursor ->
            """
            {
              "type": "device.connected",
              "cursor": "$cursor",
              "occurredAt": "2026-08-05T00:00:00.000Z",
              "payload": { "deviceId": "device_01" }
            }
            """.trimIndent()
        }

        assertTrue(decoder.decode("[$events]").isFailure)
    }

    @Test
    fun rejectsANonNumericCursor() {
        val result = decoder.decode(
            """
            [
              {
                "type": "device.connected",
                "cursor": "007",
                "occurredAt": "2026-08-05T00:00:00.000Z",
                "payload": { "deviceId": "device_01" }
              }
            ]
            """.trimIndent(),
        )

        assertTrue(result.isFailure)
    }

    @Test
    fun rejectsMalformedJson() {
        assertTrue(decoder.decode("not json").isFailure)
    }
}
