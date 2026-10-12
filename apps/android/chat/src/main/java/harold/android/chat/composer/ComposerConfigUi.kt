package harold.android.chat.composer

import androidx.compose.runtime.Immutable
import harold.android.contracts.ConfigCategory
import harold.android.contracts.ConfigOption
import harold.android.contracts.categoryOf

@Immutable
data class ComposerConfigUi(
    val model: ConfigOption? = null,
    val mode: ConfigOption? = null,
    val thinking: ConfigOption? = null,
    val saving: Boolean = false,
    val error: String? = null,
)

fun composerConfigOf(options: List<ConfigOption>): ComposerConfigUi {
    var model: ConfigOption? = null
    var mode: ConfigOption? = null
    var thinking: ConfigOption? = null

    for (option in options) {
        when (categoryOf(option)) {
            ConfigCategory.Model -> model = option
            ConfigCategory.Mode -> mode = option
            ConfigCategory.ThoughtLevel -> thinking = option
            ConfigCategory.ModelConfig,
            ConfigCategory.Other,
            -> Unit
        }
    }

    return ComposerConfigUi(model = model, mode = mode, thinking = thinking)
}
