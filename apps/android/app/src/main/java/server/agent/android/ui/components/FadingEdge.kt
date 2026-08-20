package server.agent.android.ui.components

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Applies a smooth alpha gradient fade mask to the top and/or bottom edges of a Composable,
 * such as a scrollable transcript, so content gracefully dissolves as it scrolls out of view.
 */
fun Modifier.fadingEdge(
    top: Dp = 0.dp,
    bottom: Dp = 0.dp,
): Modifier {
    if (top <= 0.dp && bottom <= 0.dp) {
        return this
    }

    return this
        .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
        .drawWithContent {
            drawContent()

            val topPx = top.toPx()
            val bottomPx = bottom.toPx()
            val height = size.height
            if (height <= 0f) return@drawWithContent

            if (topPx > 0f) {
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(Color.Transparent, Color.Black),
                        startY = 0f,
                        endY = topPx.coerceAtMost(height),
                    ),
                    blendMode = BlendMode.DstIn,
                )
            }

            if (bottomPx > 0f) {
                drawRect(
                    brush = Brush.verticalGradient(
                        colors = listOf(Color.Black, Color.Transparent),
                        startY = (height - bottomPx).coerceAtLeast(0f),
                        endY = height,
                    ),
                    blendMode = BlendMode.DstIn,
                )
            }
        }
}
