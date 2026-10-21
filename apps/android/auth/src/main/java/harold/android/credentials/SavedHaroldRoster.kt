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

fun upsertSavedHarold(
    saved: List<StoredCredential>,
    next: StoredCredential,
): List<StoredCredential> {
    val index = saved.indexOfFirst { harold -> harold.serverOrigin == next.serverOrigin }
    if (index < 0) {
        return saved + next
    }

    return saved.mapIndexed { itemIndex, harold ->
        if (itemIndex == index) next else harold
    }
}

internal fun encodeSavedHarolds(saved: List<StoredCredential>): String =
    buildJsonArray {
        saved.forEach { harold ->
            add(
                buildJsonObject {
                    put("formatVersion", harold.formatVersion)
                    put("deviceId", harold.deviceId)
                    put("serverOrigin", harold.serverOrigin)
                    put("deviceName", harold.deviceName)
                    put("credential", harold.credential)
                    put("name", harold.name)
                    put("colorId", harold.colorId)
                    put("iconId", harold.iconId)
                },
            )
        }
    }.toString()

internal fun decodeSavedHarolds(raw: String?): List<StoredCredential> {
    if (raw == null) {
        return emptyList()
    }

    return Json.parseToJsonElement(raw).jsonArray.map { element ->
        val harold = element.jsonObject
        StoredCredential(
            formatVersion = harold.requireInt("formatVersion"),
            deviceId = harold.requireString("deviceId"),
            serverOrigin = harold.requireString("serverOrigin"),
            deviceName = harold.optionalString("deviceName"),
            credential = harold.requireString("credential"),
            name = harold.requireString("name"),
            colorId = harold.requireString("colorId"),
            iconId = harold.requireString("iconId"),
        )
    }
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
