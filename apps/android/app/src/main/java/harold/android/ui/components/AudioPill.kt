package harold.android.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.progressSemantics
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlin.math.min

private val MIN_TOUCH_TARGET = 48.dp
private val WAVEFORM_BAR_COUNT = 7
private val COUNTDOWN_STROKE = 3.dp

/**
 * A compact interactive audio pill displaying a reactive sound-wave equalizer during active
 * dictation, or a paused/standby state when muted. Pass [silenceCountdownDurationMs] to run a
 * mute countdown: a primary-coloured line traces the pill outline and drains clockwise from the
 * top over that long. Null means no countdown.
 */
@Composable
fun AudioPill(
    isListening: Boolean,
    audioLevel: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    silenceCountdownDurationMs: Long? = null,
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

    val countdownProgress = remember { Animatable(1f) }
    LaunchedEffect(silenceCountdownDurationMs) {
        countdownProgress.snapTo(1f)
        if (silenceCountdownDurationMs != null) {
            countdownProgress.animateTo(
                targetValue = 0f,
                animationSpec = tween(
                    durationMillis = silenceCountdownDurationMs.toInt(),
                    easing = LinearEasing,
                ),
            )
        }
    }

    val pillBackground = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.85f)
    val pillBorderColor = if (isListening) {
        MaterialTheme.colorScheme.primary.copy(alpha = 0.6f)
    } else {
        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
    }

    val primaryColor = MaterialTheme.colorScheme.primary
    val secondaryColor = MaterialTheme.colorScheme.secondary
    val trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)

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
            .testTag("audio_pill")
            .semantics {
                role = Role.Button
                if (contentDescription != null) {
                    this.contentDescription = contentDescription
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        if (silenceCountdownDurationMs != null) {
            val progress = countdownProgress.value
            val outline = remember { Path() }
            val drained = remember { Path() }
            val outlineMeasure = remember { PathMeasure() }
            Canvas(
                modifier = Modifier
                    .matchParentSize()
                    .progressSemantics(progress)
                    .testTag("audio_pill_silence_ring"),
            ) {
                val stroke = COUNTDOWN_STROKE.toPx()
                buildPillOutline(outline, stroke)
                drawPath(
                    path = outline,
                    color = trackColor,
                    style = Stroke(width = stroke),
                )
                outlineMeasure.setPath(outline, false)
                drained.reset()
                outlineMeasure.getSegment(
                    startDistance = 0f,
                    stopDistance = outlineMeasure.length * progress,
                    destination = drained,
                    startWithMoveTo = true,
                )
                drawPath(
                    path = drained,
                    color = primaryColor,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }

        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
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

/**
 * Traces the pill's own stadium outline into [path], inset by half of [strokeWidth] so the line
 * sits inside the bounds. Starts at top centre and runs clockwise, so a path segment taken from
 * zero drains the same way a clock hand sweeps.
 */
private fun DrawScope.buildPillOutline(path: Path, strokeWidth: Float) {
    val inset = strokeWidth / 2f
    val left = inset
    val top = inset
    val right = size.width - inset
    val bottom = size.height - inset
    val midX = size.width / 2f
    val radius = (min(size.width, size.height) - strokeWidth) / 2f

    path.reset()
    path.moveTo(midX, top)
    path.lineTo(right - radius, top)
    path.arcTo(
        rect = Rect(right - radius * 2f, top, right, bottom),
        startAngleDegrees = -90f,
        sweepAngleDegrees = 180f,
        forceMoveTo = false,
    )
    path.lineTo(left + radius, bottom)
    path.arcTo(
        rect = Rect(left, top, left + radius * 2f, bottom),
        startAngleDegrees = 90f,
        sweepAngleDegrees = 180f,
        forceMoveTo = false,
    )
    path.lineTo(midX, top)
}
