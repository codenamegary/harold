package harold.android.credentials

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

fun upsertSavedConnection(
    saved: List<SavedConnection>,
    next: SavedConnection,
): List<SavedConnection> {
    val index = saved.indexOfFirst { connection -> connection.connectionId == next.connectionId }
    if (index < 0) {
        return saved + next
    }

    return saved.mapIndexed { itemIndex, connection ->
        if (itemIndex == index) next else connection
    }
}

internal fun encodeSavedConnections(saved: List<SavedConnection>): String =
    buildJsonArray {
        saved.forEach { connection ->
            add(
                buildJsonObject {
                    put("formatVersion", connection.formatVersion)
                    put("connectionId", connection.connectionId)
                    put("deviceName", connection.deviceName)
                    put("name", connection.name)
                    put("colorId", connection.colorId)
                    put("iconId", connection.iconId)
                    put("ssh", encodeSsh(connection.ssh))
                    put("defaultAgentId", connection.defaultAgentId)
                    put("defaultWorkspacePath", connection.defaultWorkspacePath)
                },
            )
        }
    }.toString()

internal fun decodeSavedConnections(raw: String?): List<SavedConnection> {
    if (raw == null) {
        return emptyList()
    }

    // Rows that no longer match the current format are dropped, not migrated.
    return Json.parseToJsonElement(raw).jsonArray.mapNotNull { element ->
        runCatching {
            val connection = element.jsonObject
            SavedConnection(
                formatVersion = connection.requireInt("formatVersion"),
                connectionId = connection.requireString("connectionId"),
                deviceName = connection.optionalString("deviceName"),
                name = connection.requireString("name"),
                colorId = connection.requireString("colorId"),
                iconId = connection.requireString("iconId"),
                ssh = decodeSsh(connection.getValue("ssh").jsonObject),
                defaultAgentId = connection.optionalString("defaultAgentId"),
                defaultWorkspacePath = connection.optionalString("defaultWorkspacePath"),
            )
        }.getOrNull()
    }
}

private fun encodeSsh(ssh: SshConfig): JsonObject = buildJsonObject {
    put("host", ssh.host)
    put("port", ssh.port)
    put("user", ssh.user)
    put("hostKeyFingerprint", ssh.hostKeyFingerprint)
    put(
        "auth",
        buildJsonObject {
            when (val auth = ssh.auth) {
                is SshAuth.PrivateKey -> {
                    put("type", "private_key")
                    put("pem", auth.pem)
                    put("publicKey", auth.publicKey)
                }
                is SshAuth.Password -> {
                    put("type", "password")
                    put("secret", auth.secret)
                }
            }
        },
    )
}

private fun decodeSsh(element: JsonObject): SshConfig {
    val auth = element.getValue("auth").jsonObject
    val sshAuth = when (auth.requireString("type")) {
        "private_key" -> SshAuth.PrivateKey(
            pem = auth.requireString("pem"),
            publicKey = auth.requireString("publicKey"),
        )
        "password" -> SshAuth.Password(secret = auth.requireString("secret"))
        else -> error("Unknown SSH auth type")
    }
    return SshConfig(
        host = element.requireString("host"),
        port = element.requireInt("port"),
        user = element.requireString("user"),
        auth = sshAuth,
        hostKeyFingerprint = element.requireString("hostKeyFingerprint"),
    )
}

private fun JsonObject.requireString(key: String): String = getValue(key).jsonPrimitive.content

private fun JsonObject.requireInt(key: String): Int = getValue(key).jsonPrimitive.int

private fun JsonObject.optionalString(key: String): String? {
    val value = get(key) ?: return null
    if (value is JsonNull) {
        return null
    }
    return value.jsonPrimitive.content
}
