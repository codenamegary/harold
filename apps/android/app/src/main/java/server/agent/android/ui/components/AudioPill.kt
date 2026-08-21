package server.agent.android.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val MIN_TOUCH_TARGET = 48.dp
private val WAVEFORM_BAR_COUNT = 7

/**
 * A compact interactive audio pill displaying a reactive sound-wave equalizer during active
 * dictation, or a paused/standby state when muted.
 */
@Composable
fun AudioPill(
    isListening: Boolean,
    audioLevel: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    contentDescription: String? = null,
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() },
) {
    val clampedLevel = audioLevel.coerceIn(0f, 1f)

    val animatedLevel by animateFloatAsState(
        targetValue = if (isListening) clampedLevel else 0f,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = 400f),
        label = "audio_pill_level",
    )

    val infiniteTransition = rememberInfiniteTransition(label = "audio_pill_idle")
    val idlePulse by infiniteTransition.animateFloat(
        initialValue = 0.2f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "idle_pulse",
    )

    val pillBackground = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.85f)
    val pillBorderColor = if (isListening) {
        MaterialTheme.colorScheme.primary.copy(alpha = 0.6f)
    } else {
        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
    }

    val primaryColor = MaterialTheme.colorScheme.primary
    val secondaryColor = MaterialTheme.colorScheme.secondary

    Box(
        modifier = modifier
            .defaultMinSize(minWidth = MIN_TOUCH_TARGET, minHeight = MIN_TOUCH_TARGET)
            .clip(CircleShape)
            .background(pillBackground)
            .border(
                border = BorderStroke(1.dp, pillBorderColor),
                shape = CircleShape,
            )
            .clickable(
                enabled = enabled,
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .testTag("audio_pill")
            .semantics {
                role = Role.Button
                if (contentDescription != null) {
                    this.contentDescription = contentDescription
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = if (isListening) Icons.Filled.Mic else Icons.Filled.MicOff,
                contentDescription = null,
                tint = if (isListening) primaryColor else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .size(20.dp)
                    .testTag("audio_pill_icon"),
            )

            // Equalizer Bars
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
                modifier = Modifier
                    .height(24.dp)
                    .testTag("audio_pill_bars"),
            ) {
                val barWeights = floatArrayOf(0.35f, 0.65f, 0.95f, 1.0f, 0.85f, 0.55f, 0.35f)
                for (i in 0 until WAVEFORM_BAR_COUNT) {
                    val weight = barWeights[i]
                    val dynamicHeight = if (isListening) {
                        val baseHeight = 4f + (weight * 4f)
                        val reactiveHeight = weight * animatedLevel * 16f
                        val idleBoost = (1f - animatedLevel) * idlePulse * weight * 6f
                        (baseHeight + reactiveHeight + idleBoost).coerceIn(4f, 22f)
                    } else {
                        4f
                    }

                    val barBrush = Brush.verticalGradient(
                        colors = if (isListening) {
                            listOf(primaryColor, secondaryColor)
                        } else {
                            listOf(
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                            )
                        },
                    )

                    Box(
                        modifier = Modifier
                            .width(3.dp)
                            .height(dynamicHeight.dp)
                            .clip(RoundedCornerShape(percent = 50))
                            .background(barBrush),
                    )
                }
            }
        }
    }
}
