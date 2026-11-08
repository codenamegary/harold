package harold.android.ui.components

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import harold.android.design.R
import kotlin.math.roundToInt

private enum class RevealValue {
    Settled,
    Revealed,
}

/** How far the row's trailing edge retracts to uncover Delete. */
private val RevealWidth = 88.dp

/**
 * Wraps a list item so a horizontal drag reveals a destructive action at its
 * trailing edge. The action is also exposed as a custom accessibility action.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SwipeToDeleteListItem(
    rowTag: String,
    deleteLabel: String,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = RoundedCornerShape(12.dp),
    deleteActionTag: String = "swipe_delete_action_$rowTag",
    confirmationEnabled: Boolean = true,
    confirmationTitle: String = deleteLabel,
    confirmationText: String? = null,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val revealPx = with(density) { RevealWidth.toPx() }
    val cancelLabel = stringResource(R.string.harold_cancel)
    var confirmationVisible by remember { mutableStateOf(false) }

    val requestDelete: () -> Unit = {
        if (confirmationEnabled) {
            confirmationVisible = true
        } else {
            onDelete()
        }
    }

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
            .clip(shape)
            .anchoredDraggable(
                state = state,
                orientation = Orientation.Horizontal,
                enabled = enabled,
                flingBehavior = flingBehavior,
            )
            .semantics {
                if (enabled) {
                    customActions = listOf(
                        CustomAccessibilityAction(deleteLabel) {
                            requestDelete()
                            true
                        },
                    )
                }
            }
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
                IconButton(
                    onClick = requestDelete,
                    modifier = Modifier.testTag(deleteActionTag),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = deleteLabel,
                        tint = MaterialTheme.colorScheme.onError,
                    )
                }
            }
        }
    }

    if (confirmationEnabled && confirmationVisible) {
        AlertDialog(
            onDismissRequest = { confirmationVisible = false },
            title = { Text(text = confirmationTitle) },
            text = if (confirmationText == null) {
                null
            } else {
                { Text(text = confirmationText) }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmationVisible = false
                        onDelete()
                    },
                    modifier = Modifier.testTag("swipe_delete_confirm_action_$rowTag"),
                ) {
                    Text(text = deleteLabel)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { confirmationVisible = false },
                    modifier = Modifier.testTag("swipe_delete_confirm_cancel_$rowTag"),
                ) {
                    Text(text = cancelLabel)
                }
            },
            modifier = Modifier.testTag("swipe_delete_confirm_$rowTag"),
        )
    }
}
