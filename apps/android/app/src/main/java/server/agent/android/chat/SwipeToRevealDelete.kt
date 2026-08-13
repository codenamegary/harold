package server.agent.android.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.AnchoredDraggableDefaults
import androidx.compose.foundation.gestures.AnchoredDraggableState
import androidx.compose.foundation.gestures.DraggableAnchors
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.anchoredDraggable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

private enum class RevealValue {
    Settled,
    Revealed,
}

/** How far the row's trailing edge retracts to uncover Delete. */
private val RevealWidth = 88.dp

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SwipeToRevealDelete(
    rowTag: String,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val revealPx = with(density) { RevealWidth.toPx() }

    val state = remember(revealPx) {
        AnchoredDraggableState(
            initialValue = RevealValue.Settled,
            anchors = DraggableAnchors {
                RevealValue.Settled at 0f
                RevealValue.Revealed at -revealPx
            },
        )
    }
    val flingBehavior = AnchoredDraggableDefaults.flingBehavior(state = state)

    val revealedPx = (-state.offset).let { value ->
        if (value.isNaN()) 0f else value.coerceIn(0f, revealPx)
    }
    val revealedWidth = with(density) { revealedPx.roundToInt().toDp() }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(12.dp))
            .anchoredDraggable(
                state = state,
                orientation = Orientation.Horizontal,
                flingBehavior = flingBehavior,
            )
            .testTag("swipe_delete_$rowTag"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.weight(1f)) {
            content()
        }

        Box(
            modifier = Modifier
                .width(revealedWidth)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.error),
            contentAlignment = Alignment.Center,
        ) {
            if (revealedPx > revealPx * 0.35f) {
                TextButton(
                    onClick = onDelete,
                    modifier = Modifier.testTag("session_delete_$rowTag"),
                ) {
                    Text(
                        text = "Delete",
                        color = MaterialTheme.colorScheme.onError,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }
    }
}
