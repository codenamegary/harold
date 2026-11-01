package harold.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

/**
 * Semantic colors for structured diffs. Screens read these instead of
 * hardcoding green and red, so light and dark themes stay readable.
 */
data class DiffColors(
    val additionBackground: Color,
    val additionText: Color,
    val deletionBackground: Color,
    val deletionText: Color,
    val contextText: Color,
    val gutterText: Color,
    val gutterBackground: Color,
)

@Composable
fun diffColors(): DiffColors {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    return if (dark) {
        DiffColors(
            additionBackground = DiffAdditionBackground,
            additionText = DiffAdditionText,
            deletionBackground = DiffDeletionBackground,
            deletionText = DiffDeletionText,
            contextText = MaterialTheme.colorScheme.onSurface,
            gutterText = MaterialTheme.colorScheme.onSurfaceVariant,
            gutterBackground = MaterialTheme.colorScheme.surfaceContainerLow,
        )
    } else {
        DiffColors(
            additionBackground = LightDiffAdditionBackground,
            additionText = LightDiffAdditionText,
            deletionBackground = LightDiffDeletionBackground,
            deletionText = LightDiffDeletionText,
            contextText = MaterialTheme.colorScheme.onSurface,
            gutterText = MaterialTheme.colorScheme.onSurfaceVariant,
            gutterBackground = MaterialTheme.colorScheme.surfaceContainer,
        )
    }
}
