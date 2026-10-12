package harold.android.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme = darkColorScheme(
    primary = Lime,
    onPrimary = LimeInk,
    primaryContainer = PanelElevated,
    onPrimaryContainer = Lime,
    secondary = Violet,
    onSecondary = LimeInk,
    secondaryContainer = PanelElevated,
    onSecondaryContainer = VioletSoft,
    tertiary = Amber,
    onTertiary = LimeInk,
    background = Ink,
    onBackground = Body,
    surface = Panel,
    onSurface = Body,
    surfaceVariant = Panel2,
    onSurfaceVariant = Muted,
    surfaceContainerHighest = PanelElevated,
    surfaceContainerHigh = PanelElevated,
    surfaceContainer = Panel2,
    surfaceContainerLow = Panel,
    surfaceContainerLowest = Ink,
    outline = Line,
    outlineVariant = LineSoft,
    error = Danger,
    onError = LimeInk,
    errorContainer = PanelElevated,
    onErrorContainer = Danger,
)

private val LightColorScheme = lightColorScheme(
    primary = Lime,
    onPrimary = LimeInk,
    primaryContainer = LightPrimaryContainer,
    onPrimaryContainer = LimeInk,
    secondary = Violet,
    onSecondary = LimeInk,
    secondaryContainer = LightSecondaryContainer,
    onSecondaryContainer = LimeInk,
    tertiary = Amber,
    onTertiary = LimeInk,
    background = LightBackground,
    onBackground = LightOnSurface,
    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurfaceVariant,
    outline = LightOutline,
    outlineVariant = LightOutlineVariant,
    error = Danger,
    onError = LimeInk,
    errorContainer = LightErrorContainer,
    onErrorContainer = LightOnErrorContainer,
)

@Composable
fun HaroldTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) {
                dynamicDarkColorScheme(context)
            } else {
                dynamicLightColorScheme(context)
            }
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}
