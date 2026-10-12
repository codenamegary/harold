package harold.android.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily

@Composable
fun ActivityStatusLine(
    label: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
) {
    val hasSubtitle = !subtitle.isNullOrEmpty()
    val ariaLabel = if (hasSubtitle) "$label: $subtitle" else label

    Column(
        modifier = modifier
            .testTag("activity_status_line")
            .semantics {
                contentDescription = ariaLabel
                liveRegion = LiveRegionMode.Polite
            },
    ) {
        ThinkingIndicator(label = label)
        if (hasSubtitle && subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Monospace,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
