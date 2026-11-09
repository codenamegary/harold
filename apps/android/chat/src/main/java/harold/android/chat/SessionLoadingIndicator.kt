package harold.android.chat

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import kotlin.math.abs
import kotlin.math.min

private val PulseFieldSize = 132.dp
private val TerminalBadgeSize = 58.dp
private val TerminalBadgeShape = RoundedCornerShape(16.dp)
private val LoadingDotSize = 6.dp

/**
 * The session handshake, drawn where the transcript lives: an expanding signal
 * around the terminal mark while the stream attaches, then the resumed
 * transcript replaces it. The animation is decorative; the phase text under it
 * is the part accessibility services read.
 */
@Composable
fun SessionLoadingIndicator(
    reconnecting: Boolean,
    modifier: Modifier = Modifier,
) {
    val accent = MaterialTheme.colorScheme.primary
    val detail = if (reconnecting) {
        stringResource(R.string.chat_session_loading_replay)
    } else {
        stringResource(R.string.chat_session_loading_attach)
    }
    val description = stringResource(R.string.chat_session_loading_content_description, detail)

    val transition = rememberInfiniteTransition(label = "session-loading")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "session-loading-phase",
    )
    val badgeAlpha by transition.animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "session-loading-badge",
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .testTag("session_loading")
            .semantics(mergeDescendants = true) {
                contentDescription = description
            }
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier.size(PulseFieldSize),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val center = Offset(size.width / 2f, size.height / 2f)
                val shortest = min(size.width, size.height)

                // Three rings leave the terminal mark and fade as they travel,
                // staggered so one is always on screen.
                repeat(3) { index ->
                    val pulse = (phase + index / 3f) % 1f
                    val radius = shortest * (0.19f + 0.27f * pulse)
                    drawCircle(
                        color = accent.copy(alpha = (1f - pulse) * 0.32f),
                        radius = radius,
                        center = center,
                        style = Stroke(
                            width = (0.5f + 1.4f * (1f - pulse)).dp.toPx(),
                        ),
                    )
                }

                // A short arc orbits the mark so the state reads as active even
                // on the frames where the rings are faint.
                val arcRadius = shortest * 0.39f
                drawArc(
                    color = accent.copy(alpha = 0.85f),
                    startAngle = phase * 360f,
                    sweepAngle = 64f,
                    useCenter = false,
                    topLeft = Offset(center.x - arcRadius, center.y - arcRadius),
                    size = Size(arcRadius * 2f, arcRadius * 2f),
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
                )
                drawArc(
                    color = accent.copy(alpha = 0.22f),
                    startAngle = phase * 360f + 180f,
                    sweepAngle = 38f,
                    useCenter = false,
                    topLeft = Offset(center.x - arcRadius, center.y - arcRadius),
                    size = Size(arcRadius * 2f, arcRadius * 2f),
                    style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round),
                )
            }

            Box(
                modifier = Modifier
                    .size(TerminalBadgeSize)
                    .background(
                        color = MaterialTheme.colorScheme.surfaceContainerHigh,
                        shape = TerminalBadgeShape,
                    )
                    .border(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.outline,
                        shape = TerminalBadgeShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "›_",
                    style = MaterialTheme.typography.titleMedium,
                    fontFamily = FontFamily.Monospace,
                    color = accent,
                    modifier = Modifier.alpha(badgeAlpha),
                )
            }
        }

        Text(
            text = stringResource(R.string.chat_session_loading_title),
            style = MaterialTheme.typography.bodyMedium.copy(
                fontFamily = FontFamily.Monospace,
                letterSpacing = 0.08.em,
            ),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(top = 14.dp),
        )

        Text(
            text = detail,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 4.dp),
        )

        Row(
            modifier = Modifier.padding(top = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(3) { index ->
                val wave = triangleWave((phase + index / 3f) % 1f)
                Box(
                    modifier = Modifier
                        .size(LoadingDotSize)
                        .graphicsLayer {
                            scaleX = 0.7f + 0.45f * wave
                            scaleY = 0.7f + 0.45f * wave
                        }
                        .background(
                            color = accent.copy(alpha = 0.2f + 0.8f * wave),
                            shape = CircleShape,
                        ),
                )
            }
        }
    }
}

/** 0 at both ends, 1 in the middle, so each dot fades in and out. */
private fun triangleWave(value: Float): Float = 1f - abs(value * 2f - 1f)
