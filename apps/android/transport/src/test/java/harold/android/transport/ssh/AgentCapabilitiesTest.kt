package harold.android.transport.ssh

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentCapabilitiesTest {
    private val initialize = buildJsonObject {
        putJsonObject("agentInfo") {
            put("name", "OpenCode")
            put("version", "1.0")
        }
        putJsonObject("agentCapabilities") {
            put("loadSession", true)
            putJsonObject("promptCapabilities") {
                put("image", true)
                put("embeddedContext", true)
            }
            putJsonObject("sessionCapabilities") {
                put("resume", true)
            }
            put("surpriseCapability", true)
        }
    }

    @Test
    fun inventoryListsKnownPathsAndUnknownLeaves() {
        val inventory = buildCapabilityInventory(initialize)!!
        assertEquals("OpenCode", inventory.agentInfo?.name)

        val image = inventory.entries.find { it.path == "promptCapabilities.image" }!!
        assertTrue(image.advertised)
        assertTrue(image.known)

        val audio = inventory.entries.find { it.path == "promptCapabilities.audio" }!!
        assertFalse(audio.advertised)
        assertTrue(audio.known)

        val surprise = inventory.entries.find { it.path == "surpriseCapability" }!!
        assertTrue(surprise.advertised)
        assertFalse(surprise.known)
    }

    @Test
    fun promptGatingReadsTheLiveHandshake() {
        val inventory = buildCapabilityInventory(initialize)
        assertTrue(advertisesPromptImage(inventory))
        assertTrue(advertisesEmbeddedContext(inventory))
    }

    @Test
    fun noHandshakeMeansNoCapabilities() {
        assertNull(buildCapabilityInventory(null))
        assertNull(buildCapabilityInventory(buildJsonObject { put("unrelated", true) }))
        assertFalse(advertisesPromptImage(null))
    }
}
