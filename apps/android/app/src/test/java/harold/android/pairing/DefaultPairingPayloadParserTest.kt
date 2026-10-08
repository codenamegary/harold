package harold.android.pairing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class DefaultPairingPayloadParserTest {
    private val parser = DefaultPairingPayloadParser()

    @Test
    fun parsesVersionedUri() {
        val payload =
            "harold://pair?v=1&endpoint=https%3A%2F%2Fagent.example.com&code=R7K-4MP"

        val parsed = parser.parse(payload)

        assertEquals("https://agent.example.com", parsed.endpoint)
        assertEquals("R7K-4MP", parsed.code)
    }

    @Test
    fun rejectsUnsupportedVersion() {
        val payload =
            "harold://pair?v=2&endpoint=https%3A%2F%2Fagent.example.com&code=R7K-4MP"

        assertThrows(PairingPayloadParseException::class.java) {
            parser.parse(payload)
        }
    }

    @Test
    fun rejectsDuplicateFields() {
        val payload =
            "harold://pair?v=1&v=1&endpoint=https%3A%2F%2Fagent.example.com&code=R7K-4MP"

        assertThrows(PairingPayloadParseException::class.java) {
            parser.parse(payload)
        }
    }

    @Test
    fun rejectsLegacyJson() {
        assertThrows(PairingPayloadParseException::class.java) {
            parser.parse("""{"code":"R7K-4MP","endpoint":"http://127.0.0.1:3847"}""")
        }
    }

    @Test
    fun acceptsCleartextLanEndpoint() {
        val payload =
            "harold://pair?v=1&endpoint=http%3A%2F%2F192.168.1.20%3A3847&code=R7K-4MP"

        val parsed = parser.parse(payload)

        assertEquals("http://192.168.1.20:3847", parsed.endpoint)
    }

    @Test
    fun rejectsInvalidScheme() {
        assertThrows(PairingPayloadParseException::class.java) {
            parser.parse("https://pair?v=1&endpoint=https%3A%2F%2Fa.example&code=R7K-4MP")
        }
    }

    @Test
    fun rejectsLegacyAgentServerSchemeWithAppUpdateMessage() {
        val payload = "agent-server://pair?v=1&endpoint=https%3A%2F%2Fa.example&code=R7K-4MP"
        val exception = assertThrows(PairingPayloadParseException::class.java) {
            parser.parse(payload)
        }
        assertEquals("Legacy agent-server pairing payload is not supported; app update required", exception.message)
    }

    @Test
    fun rejectsInvalidCodeFormat() {
        assertThrows(PairingPayloadParseException::class.java) {
            parser.parse(
                "harold://pair?v=1&endpoint=https%3A%2F%2Fa.example&code=SHORT",
            )
        }
    }

    @Test
    fun rejectsMissingEndpoint() {
        assertThrows(PairingPayloadParseException::class.java) {
            parser.parse("harold://pair?v=1&code=R7K-4MP")
        }
    }
}
