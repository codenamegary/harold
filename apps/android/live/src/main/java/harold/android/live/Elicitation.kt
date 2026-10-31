package harold.android.live

import harold.android.contracts.AgentId
import java.net.URI
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/** Sentinel choice id used by the UI to mean the `<key>_custom` companion. */
const val OTHER_OPTION_VALUE = "__harold_other__"

data class ElicitationOption(
    val value: String,
    val title: String,
)

sealed interface ElicitationKind {
    data class Text(
        val minLength: Int? = null,
        val maxLength: Int? = null,
        val pattern: Regex? = null,
        val format: String? = null,
    ) : ElicitationKind

    data class SingleSelect(
        val options: List<ElicitationOption>,
    ) : ElicitationKind

    data class MultiSelect(
        val options: List<ElicitationOption>,
        val minItems: Int? = null,
        val maxItems: Int? = null,
    ) : ElicitationKind

    data class NumberField(
        val integer: Boolean,
        val minimum: Double? = null,
        val maximum: Double? = null,
    ) : ElicitationKind

    data object BooleanField : ElicitationKind
}

data class ElicitationQuestion(
    val key: String,
    val title: String,
    val description: String?,
    val required: Boolean,
    val kind: ElicitationKind,
    val defaultValue: JsonElement? = null,
    /** Companion `<key>_custom` property, when the schema provides one. */
    val otherKey: String? = null,
)

sealed interface Elicitation {
    val requestId: String
    val agentId: AgentId
    val sessionId: String
    val message: String?
    val raw: JsonElement

    data class Form(
        override val requestId: String,
        override val agentId: AgentId,
        override val sessionId: String,
        override val message: String?,
        override val raw: JsonElement,
        val questions: List<ElicitationQuestion>,
    ) : Elicitation

    data class Url(
        override val requestId: String,
        override val agentId: AgentId,
        override val sessionId: String,
        override val message: String?,
        override val raw: JsonElement,
        val elicitationId: String,
        val url: String,
        val host: String,
    ) : Elicitation

    data class Unsupported(
        override val requestId: String,
        override val agentId: AgentId,
        override val sessionId: String,
        override val message: String?,
        override val raw: JsonElement,
        val reason: String? = null,
    ) : Elicitation
}

data class UrlSafety(
    val host: String,
    val insecure: Boolean,
    val punycode: Boolean,
)

fun analyzeElicitationUrl(url: String): UrlSafety? {
    val uri = runCatching { URI(url) }.getOrNull() ?: return null
    val scheme = uri.scheme?.lowercase() ?: return null
    if (scheme != "http" && scheme != "https") {
        return null
    }
    val host = uri.host?.takeIf { it.isNotEmpty() } ?: return null
    val lowerHost = host.lowercase()
    return UrlSafety(
        host = host,
        insecure = scheme == "http",
        punycode = lowerHost.startsWith("xn--") || lowerHost.contains(".xn--"),
    )
}

fun parseElicitation(
    requestId: String,
    agentId: AgentId,
    sessionId: String,
    params: JsonElement,
): Elicitation {
    val fields = params as? JsonObject
        ?: return Elicitation.Unsupported(
            requestId = requestId,
            agentId = agentId,
            sessionId = sessionId,
            message = null,
            raw = params,
            reason = "malformed params",
        )

    val message = fields.stringOrNull("message")
    return when (fields.stringOrNull("mode")) {
        "form" -> parseFormElicitation(requestId, agentId, sessionId, message, params, fields)
        "url" -> parseUrlElicitation(requestId, agentId, sessionId, message, params, fields)
        else -> Elicitation.Unsupported(
            requestId = requestId,
            agentId = agentId,
            sessionId = sessionId,
            message = message,
            raw = params,
            reason = "unknown mode",
        )
    }
}

private fun parseFormElicitation(
    requestId: String,
    agentId: AgentId,
    sessionId: String,
    message: String?,
    params: JsonElement,
    fields: JsonObject,
): Elicitation {
    val schema = fields["requestedSchema"] as? JsonObject
        ?: return Elicitation.Unsupported(
            requestId, agentId, sessionId, message, params, "missing schema",
        )
    if (schema.stringOrNull("type") != "object") {
        return Elicitation.Unsupported(
            requestId, agentId, sessionId, message, params, "schema is not an object",
        )
    }
    val properties = schema["properties"] as? JsonObject
        ?: return Elicitation.Unsupported(
            requestId, agentId, sessionId, message, params, "missing properties",
        )
    val required = (schema["required"] as? JsonArray)
        ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        ?.toSet()
        ?: emptySet()

    val pairedCustomKeys = mutableSetOf<String>()
    for (key in properties.keys) {
        if (!key.endsWith("_custom")) {
            continue
        }
        val baseKey = key.removeSuffix("_custom")
        val base = properties[baseKey] as? JsonObject ?: continue
        if (isSelectSchema(base)) {
            pairedCustomKeys.add(key)
        }
    }

    val questions = mutableListOf<ElicitationQuestion>()
    for ((key, value) in properties) {
        if (key in pairedCustomKeys) {
            continue
        }
        val property = value as? JsonObject
        if (property == null) {
            if (key in required) {
                return Elicitation.Unsupported(
                    requestId, agentId, sessionId, message, params, "malformed required field",
                )
            }
            continue
        }
        val parsed = parseQuestion(
            key = key,
            property = property,
            required = key in required,
            otherKey = "${key}_custom".takeIf { it in pairedCustomKeys },
        )
        if (parsed == null) {
            if (key in required) {
                return Elicitation.Unsupported(
                    requestId, agentId, sessionId, message, params, "unsupported required field",
                )
            }
            continue
        }
        questions.add(parsed)
    }

    return Elicitation.Form(
        requestId = requestId,
        agentId = agentId,
        sessionId = sessionId,
        message = message,
        raw = params,
        questions = questions,
    )
}

private fun parseUrlElicitation(
    requestId: String,
    agentId: AgentId,
    sessionId: String,
    message: String?,
    params: JsonElement,
    fields: JsonObject,
): Elicitation {
    val url = fields.stringOrNull("url")
        ?: return Elicitation.Unsupported(
            requestId, agentId, sessionId, message, params, "missing url",
        )
    val safety = analyzeElicitationUrl(url)
        ?: return Elicitation.Unsupported(
            requestId, agentId, sessionId, message, params, "unsupported url scheme",
        )
    return Elicitation.Url(
        requestId = requestId,
        agentId = agentId,
        sessionId = sessionId,
        message = message,
        raw = params,
        elicitationId = fields.stringOrNull("elicitationId") ?: "",
        url = url,
        host = safety.host,
    )
}

private fun isSelectSchema(property: JsonObject): Boolean {
    if (property.containsKey("oneOf") || property.containsKey("enum")) {
        return true
    }
    val items = property["items"] as? JsonObject ?: return false
    return items.containsKey("anyOf") || items.containsKey("enum")
}

private fun parseQuestion(
    key: String,
    property: JsonObject,
    required: Boolean,
    otherKey: String?,
): ElicitationQuestion? {
    val type = property.stringOrNull("type") ?: return null
    val title = property.stringOrNull("title") ?: key
    val description = property.stringOrNull("description")
    val default = property["default"]

    val kind = when (type) {
        "string" -> parseStringKind(property) ?: return null
        "number" -> ElicitationKind.NumberField(
            integer = false,
            minimum = property.doubleOrNull("minimum"),
            maximum = property.doubleOrNull("maximum"),
        )
        "integer" -> ElicitationKind.NumberField(
            integer = true,
            minimum = property.doubleOrNull("minimum"),
            maximum = property.doubleOrNull("maximum"),
        )
        "boolean" -> ElicitationKind.BooleanField
        "array" -> parseMultiKind(property) ?: return null
        else -> return null
    }

    return ElicitationQuestion(
        key = key,
        title = title,
        description = description,
        required = required,
        kind = kind,
        defaultValue = default?.takeIf { matchesKind(kind, it) },
        otherKey = otherKey,
    )
}

private fun parseStringKind(property: JsonObject): ElicitationKind? {
    val hasEnum = property.containsKey("enum")
    val hasOneOf = property.containsKey("oneOf")
    if (hasEnum && hasOneOf) {
        return null
    }
    if (hasEnum || hasOneOf) {
        val options = parseOptions(property["enum"], property["oneOf"]) ?: return null
        return if (options.isEmpty()) null else ElicitationKind.SingleSelect(options)
    }

    val pattern = property.stringOrNull("pattern")?.let { source ->
        runCatching { Regex(source) }.getOrNull()
    }
    return ElicitationKind.Text(
        minLength = property.intOrNull("minLength"),
        maxLength = property.intOrNull("maxLength"),
        pattern = pattern,
        format = property.stringOrNull("format"),
    )
}

private fun parseMultiKind(property: JsonObject): ElicitationKind? {
    val items = property["items"] as? JsonObject ?: return null
    val options = parseOptions(items["enum"], items["anyOf"]) ?: return null
    if (options.isEmpty()) {
        return null
    }
    return ElicitationKind.MultiSelect(
        options = options,
        minItems = property.intOrNull("minItems"),
        maxItems = property.intOrNull("maxItems"),
    )
}

private fun parseOptions(
    enumElement: JsonElement?,
    oneOfElement: JsonElement?,
): List<ElicitationOption>? {
    if (enumElement is JsonArray && oneOfElement is JsonArray) {
        return null
    }
    if (enumElement is JsonArray) {
        return enumElement.mapNotNull { element ->
            val value = (element as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            ElicitationOption(value = value, title = value)
        }
    }
    if (oneOfElement is JsonArray) {
        return oneOfElement.mapNotNull { element ->
            val option = element as? JsonObject ?: return@mapNotNull null
            val value = (option["const"] as? JsonPrimitive)?.contentOrNull
                ?: return@mapNotNull null
            ElicitationOption(
                value = value,
                title = option.stringOrNull("title") ?: value,
            )
        }
    }
    return null
}

private fun matchesKind(kind: ElicitationKind, value: JsonElement): Boolean {
    if (value is JsonNull) {
        return false
    }
    return when (kind) {
        is ElicitationKind.Text -> (value as? JsonPrimitive)?.isString == true
        is ElicitationKind.NumberField -> (value as? JsonPrimitive)?.isString != true &&
            (value as? JsonPrimitive)?.doubleOrNull != null
        ElicitationKind.BooleanField -> (value as? JsonPrimitive)?.booleanOrNull != null
        is ElicitationKind.SingleSelect -> {
            val text = (value as? JsonPrimitive)?.contentOrNull
            text != null && kind.options.any { it.value == text }
        }
        is ElicitationKind.MultiSelect -> {
            val array = value as? JsonArray ?: return false
            array.all { element ->
                val text = (element as? JsonPrimitive)?.contentOrNull
                text != null && kind.options.any { it.value == text }
            }
        }
    }
}

private fun JsonObject.stringOrNull(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }

private fun JsonObject.intOrNull(key: String): Int? =
    (this[key] as? JsonPrimitive)?.contentOrNull?.toIntOrNull()

private fun JsonObject.doubleOrNull(key: String): Double? =
    (this[key] as? JsonPrimitive)?.doubleOrNull

private val JsonPrimitive.contentOrNull: String?
    get() = if (this is JsonNull) null else content
