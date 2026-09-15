package server.agent.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class ConfigOptionValue(
    val value: String,
    val name: String,
    val description: String? = null,
)

@Serializable
sealed interface ConfigOption {
    val id: String
    val name: String
    val description: String?
    val category: String?
}

/** A writable value: the PUT body's `string | boolean` union. */
sealed interface ConfigValue {
    data class Text(val value: String) : ConfigValue

    data class Toggle(val value: Boolean) : ConfigValue
}

@Serializable
@SerialName("select")
data class SelectOption(
    override val id: String,
    override val name: String,
    override val description: String? = null,
    override val category: String? = null,
    val currentValue: String,
    val options: List<ConfigOptionValue>,
) : ConfigOption

@Serializable
@SerialName("boolean")
data class BooleanOption(
    override val id: String,
    override val name: String,
    override val description: String? = null,
    override val category: String? = null,
    val currentValue: Boolean,
) : ConfigOption

enum class ConfigCategory {
    Model,
    Mode,
    ModelConfig,
    ThoughtLevel,
    Other,
}

fun categoryOf(option: ConfigOption): ConfigCategory = when (option.category) {
    "model" -> ConfigCategory.Model
    "mode" -> ConfigCategory.Mode
    "model_config" -> ConfigCategory.ModelConfig
    "thought_level" -> ConfigCategory.ThoughtLevel
    else -> ConfigCategory.Other
}

/**
 * Decodes one session_config frame's raw options. An element that is not a
 * valid select or boolean option is dropped; a bad element never kills the
 * frame or the stream.
 */
fun parseConfigOptions(options: List<JsonElement>): List<ConfigOption> =
    options.mapNotNull { element ->
        runCatching {
            SessionStreamJson.decodeFromString(ConfigOption.serializer(), element.toString())
        }.getOrNull()
    }
