package server.agent.android.chat.composer

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.AgentCapabilityInventory
import server.agent.android.contracts.AgentCapabilityInventoryEntry
import server.agent.android.contracts.AttachmentKind
import server.agent.android.contracts.AttachmentReference
import server.agent.android.contracts.SessionStreamClientMessage

class ComposerCapabilitiesTest {
    private fun inventory(vararg entries: Pair<String, Boolean>): AgentCapabilityInventory =
        AgentCapabilityInventory(
            agentInfo = null,
            entries = entries.map { (path, value) ->
                AgentCapabilityInventoryEntry(
                    path = path,
                    advertised = true,
                    value = JsonPrimitive(value),
                    known = true,
                    requiredBy = emptyList(),
                )
            },
        )

    @Test
    fun imageCapabilityRequiresExplicitTrue() {
        assertTrue(
            supportsImageAttachments(
                inventory("promptCapabilities.image" to true),
            ),
        )
        assertFalse(
            supportsImageAttachments(
                inventory("promptCapabilities.image" to false),
            ),
        )
    }

    @Test
    fun embeddedContextCapabilityRequiresExplicitTrue() {
        assertTrue(
            supportsFileAttachments(
                inventory("promptCapabilities.embeddedContext" to true),
            ),
        )
        assertFalse(
            supportsFileAttachments(
                inventory("promptCapabilities.embeddedContext" to false),
            ),
        )
    }

    @Test
    fun missingInventoryMeansNoAttachmentSupport() {
        assertFalse(supportsImageAttachments(null))
        assertFalse(supportsFileAttachments(inventory()))
    }

    @Test
    fun advertisedEntryWithAbsentValueDoesNotEnableUi() {
        val inventory = AgentCapabilityInventory(
            agentInfo = null,
            entries = listOf(
                AgentCapabilityInventoryEntry(
                    path = PROMPT_IMAGE_CAPABILITY,
                    advertised = true,
                    value = null,
                    known = true,
                    requiredBy = emptyList(),
                ),
            ),
        )
        assertFalse(supportsImageAttachments(inventory))
    }

    @Test
    fun capabilityForKindMapsToProtocolPaths() {
        assertEquals(PROMPT_IMAGE_CAPABILITY, capabilityFor(AttachmentKind.Image))
        assertEquals(
            PROMPT_EMBEDDED_CONTEXT_CAPABILITY,
            capabilityFor(AttachmentKind.File),
        )
    }
}

class AttachmentContractsTest {
    @Test
    fun promptMessageSerializesAttachmentReferences() {
        val message = SessionStreamClientMessage.Prompt(
            agentId = "claude-code",
            sessionId = "session-1",
            text = "Summarize this",
            attachments = listOf(
                AttachmentReference(
                    kind = AttachmentKind.Image,
                    name = "shot.png",
                    mimeType = "image/png",
                    path = "/ws/.agent-server/attachments/att_1.png",
                ),
            ),
        )

        val encoded = Json.encodeToString(
            SessionStreamClientMessage.serializer(),
            message,
        )
        val element = Json.parseToJsonElement(encoded).jsonObject

        assertEquals("prompt", element["type"]?.toString()?.removeSurrounding("\""))
        val attachments = requireNotNull(element["attachments"]).jsonArray
        assertTrue(attachments.size == 1)
        val first = attachments.first().jsonObject
        assertEquals("image", (first["kind"] as JsonPrimitive).content)
        assertEquals("shot.png", (first["name"] as JsonPrimitive).content)
        assertEquals(
            "/ws/.agent-server/attachments/att_1.png",
            (first["path"] as JsonPrimitive).content,
        )
    }

    @Test
    fun promptMessageDefaultsToNoAttachments() {
        val message = SessionStreamClientMessage.Prompt(
            agentId = "claude-code",
            sessionId = "session-1",
            text = "hello",
        )

        val encoded = Json.encodeToString(
            SessionStreamClientMessage.serializer(),
            message,
        )
        val element = Json.parseToJsonElement(encoded).jsonObject

        assertEquals("prompt", element["type"]?.toString()?.removeSurrounding("\""))
        assertEquals(null, element["attachments"])
    }

    @Test
    fun referenceRoundTripsThroughJson() {
        val reference = AttachmentReference(
            kind = AttachmentKind.File,
            name = "notes.md",
            mimeType = "text/markdown",
            path = "/ws/.agent-server/attachments/att_2.md",
        )

        val decoded = Json.decodeFromString(
            AttachmentReference.serializer(),
            Json.encodeToString(AttachmentReference.serializer(), reference),
        )

        assertEquals(reference, decoded)
    }

    @Test
    fun jsonPrimitiveBooleanReadsTrue() {
        assertTrue(JsonPrimitive(true).booleanOrNull == true)
    }
}
