package server.agent.android.chat

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.em

@Composable
fun ThinkingIndicator(
    label: String = "Thinking",
    modifier: Modifier = Modifier,
) {
    val dim = MaterialTheme.colorScheme.onSurfaceVariant
    val accent = MaterialTheme.colorScheme.primary
    val transition = rememberInfiniteTransition(label = "thinking-shimmer")
    val shift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "thinking-shimmer-shift",
    )
    // Triangle wave 0→1→0 so the label pulses between dim and accent.
    val pulse = if (shift < 0.5f) shift * 2f else (1f - shift) * 2f

    Text(
        text = label,
        style = MaterialTheme.typography.bodyMedium.copy(
            fontFamily = FontFamily.Monospace,
            letterSpacing = 0.06.em,
        ),
        color = lerp(dim, accent, pulse),
        maxLines = 1,
        overflow = TextOverflow.Clip,
        modifier = modifier
            .testTag("thinking_indicator")
            .semantics {
                contentDescription = label
                liveRegion = LiveRegionMode.Polite
            },
    )
}
