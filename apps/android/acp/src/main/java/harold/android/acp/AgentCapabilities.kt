package harold.android.acp

import harold.android.contracts.AgentCapabilityAgentInfo
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentCapabilityInventoryEntry
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Capability paths the chat UI and session flows act on. Known paths always
 * appear in the inventory with `advertised: false` when the agent stays
 * silent, so a lookup never has to special-case a missing entry.
 */
val KNOWN_CAPABILITY_PATHS: List<String> = listOf(
    "loadSession",
    "sessionCapabilities.list",
    "sessionCapabilities.close",
    "sessionCapabilities.resume",
    "sessionCapabilities.delete",
    "sessionCapabilities.additionalDirectories",
    "promptCapabilities.image",
    "promptCapabilities.audio",
    "promptCapabilities.embeddedContext",
    "mcpCapabilities.http",
    "mcpCapabilities.sse",
    "auth.logout",
)

/** True when the live initialize response advertises image prompts. */
fun advertisesPromptImage(inventory: AgentCapabilityInventory?): Boolean =
    inventory?.entries?.find { it.path == "promptCapabilities.image" }?.advertised == true

/** True when the live initialize response advertises embedded context (files). */
fun advertisesEmbeddedContext(inventory: AgentCapabilityInventory?): Boolean =
    inventory?.entries?.find { it.path == "promptCapabilities.embeddedContext" }?.advertised == true

/**
 * Walks the ACP initialize response and collects every advertised capability
 * leaf. Lives only for the session that produced it — nothing is persisted,
 * so a closed session means text-only until the next handshake completes.
 */
fun buildCapabilityInventory(initialize: JsonElement?): AgentCapabilityInventory? {
    val root = initialize as? JsonObject ?: return null
    val agentCapabilities = root["agentCapabilities"] as? JsonObject
    val agentInfo = (root["agentInfo"] as? JsonObject)?.let { info ->
        val name = (info["name"] as? JsonPrimitive)?.content
        val version = (info["version"] as? JsonPrimitive)?.content
        val title = (info["title"] as? JsonPrimitive)?.content
        if (name != null && version != null) {
            AgentCapabilityAgentInfo(name = name, version = version, title = title)
        } else {
            null
        }
    }
    if (agentCapabilities == null && agentInfo == null) {
        return null
    }
    val advertised = LinkedHashMap<String, JsonElement>()
    if (agentCapabilities != null) {
        collectLeaves(agentCapabilities, emptyList(), advertised)
    }
    val entries = mutableListOf<AgentCapabilityInventoryEntry>()
    KNOWN_CAPABILITY_PATHS.forEach { path ->
        entries += AgentCapabilityInventoryEntry(
            path = path,
            advertised = advertised.containsKey(path),
            value = advertised[path],
            known = true,
        )
    }
    advertised.forEach { (path, value) ->
        if (entries.none { it.path == path }) {
            entries += AgentCapabilityInventoryEntry(
                path = path,
                advertised = true,
                value = value,
                known = false,
            )
        }
    }
    return AgentCapabilityInventory(agentInfo = agentInfo, entries = entries)
}

private fun collectLeaves(
    node: JsonObject,
    prefix: List<String>,
    out: MutableMap<String, JsonElement>,
) {
    node.forEach { (key, value) ->
        if (value is JsonObject) {
            collectLeaves(value, prefix + key, out)
        } else {
            out[(prefix + key).joinToString(".")] = value
        }
    }
}
