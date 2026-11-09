package harold.android.acp

import harold.android.contracts.AgentId
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The initialize params every Harold ACP process sends. */
fun acpInitializeParams(agentId: AgentId? = null): JsonObject = buildJsonObject {
    put("protocolVersion", 1)
    put(
        "clientCapabilities",
        buildJsonObject {
            put(
                "fs",
                buildJsonObject {
                    put("readTextFile", true)
                    put("writeTextFile", true)
                },
            )
            put("terminal", true)
            if (agentId == CURSOR_AGENT_ID) {
                // Cursor otherwise bakes effort/thinking into model variant
                // values instead of exposing a thought_level config option.
                put(
                    "_meta",
                    buildJsonObject {
                        put("parameterizedModelPicker", true)
                    },
                )
            }
        },
    )
    put(
        "clientInfo",
        buildJsonObject {
            put("name", "Harold Android")
            put("version", "android")
        },
    )
}

private const val CURSOR_AGENT_ID: AgentId = "cursor"

/**
 * True when the initialize response advertises a `sessionCapabilities`
 * entry. A missing entry or an explicit null means unsupported; `{}` means
 * supported.
 */
fun JsonElement.advertisesSessionCapability(capability: String): Boolean {
    val capabilities = ((this as? JsonObject)?.get("agentCapabilities") as? JsonObject)
        ?.get("sessionCapabilities") as? JsonObject
        ?: return false
    val value = capabilities[capability] ?: return false
    return value !is JsonNull
}

fun acpSessionListParams(cwd: String?, cursor: String?): JsonObject = buildJsonObject {
    cwd?.takeIf { it.isNotBlank() }?.let { value -> put("cwd", value) }
    cursor?.takeIf { it.isNotBlank() }?.let { value -> put("cursor", value) }
}
