package harold.android.chat.composer

import androidx.compose.ui.graphics.Color
import harold.android.ui.theme.Lime
import harold.android.ui.theme.Sky
import harold.android.ui.theme.Violet

/**
 * Mode value to text color, ported from the web's mode.colors.ts. Unknown
 * modes stay neutral.
 */
private val MODE_COLORS: Map<String, Color> = mapOf(
    "agent" to Lime,
    "build" to Lime,
    "ask" to Sky,
    "plan" to Sky,
    "edit" to Violet,
)

fun modeColorOf(value: String): Color? = MODE_COLORS[value]
