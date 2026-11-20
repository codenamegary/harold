package harold.android.chat.composer

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import harold.android.ui.theme.LightPrimary
import harold.android.ui.theme.LightSecondary
import harold.android.ui.theme.LightSkyAccent
import harold.android.ui.theme.Lime
import harold.android.ui.theme.Sky
import harold.android.ui.theme.Violet

/**
 * Mode value to text color, ported from the web's mode.colors.ts. Unknown
 * modes stay neutral. Bright accents are used on the dark transcript. The
 * light transcript needs darker content colors so the label clears contrast
 * on the pale mode tint.
 */
private val DARK_MODE_COLORS: Map<String, Color> = mapOf(
    "agent" to Lime,
    "build" to Lime,
    "ask" to Sky,
    "plan" to Sky,
    "edit" to Violet,
)

private val LIGHT_MODE_COLORS: Map<String, Color> = mapOf(
    "agent" to LightPrimary,
    "build" to LightPrimary,
    "ask" to LightSkyAccent,
    "plan" to LightSkyAccent,
    "edit" to LightSecondary,
)

@Composable
fun modeColorOf(value: String): Color? =
    modeColorOf(value, dark = MaterialTheme.colorScheme.background.luminance() < 0.5f)

fun modeColorOf(value: String, dark: Boolean): Color? =
    (if (dark) DARK_MODE_COLORS else LIGHT_MODE_COLORS)[value]
