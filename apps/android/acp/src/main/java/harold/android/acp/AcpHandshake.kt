package harold.android.acp

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The initialize params every Harold ACP process sends. */
fun acpInitializeParams(): JsonObject = buildJsonObject {
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
