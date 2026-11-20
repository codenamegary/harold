package harold.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

/**
 * The minimum interactive height the dialog buttons use, matching the rest of
 * the app's touch targets.
 */
private val MIN_TOUCH_TARGET = 48.dp

/**
 * Shared Material 3 confirmation dialog.
 *
 * A confirming tap often starts an async action (an SSH forward, a host
 * cleanup). The dialog must then stay open and show progress instead of
 * closing on a request whose result nobody can see. [busy] is the only
 * intended way to express that, so features do not re-invent a per-dialog
 * button that carries its own state: while busy the confirm button shows a
 * spinner, both buttons are disabled and [onDismissRequest] is ignored, so a
 * scrim tap or back press cannot abandon a running action.
 *
 * @param onDismissRequest asked to close the dialog, ignored while [busy].
 * @param confirmLabel label of the confirm button, used unless [busyLabel] is
 *   given while [busy].
 * @param onConfirm invoked when the confirm button is tapped.
 * @param title dialog title slot.
 * @param body dialog text slot.
 * @param dismissLabel label of the dismiss button; `null` renders no dismiss
 *   button at all.
 * @param onDismiss invoked when the dismiss button is tapped; defaults to
 *   [onDismissRequest].
 * @param busy holds the dialog open with progress on the confirm button.
 * @param busyLabel label shown on the confirm button while [busy]; defaults to
 *   [confirmLabel].
 * @param confirmModifier applied to the confirm button, for test tags.
 * @param dismissModifier applied to the dismiss button, for test tags.
 * @param destructive paints the confirm action with the error role. Use it
 *   for remove, forget, and delete confirmations.
 */
@Composable
fun HaroldDialog(
    onDismissRequest: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
    title: (@Composable () -> Unit)? = null,
    body: (@Composable () -> Unit)? = null,
    dismissLabel: String? = null,
    onDismiss: (() -> Unit)? = null,
    busy: Boolean = false,
    busyLabel: String? = null,
    confirmModifier: Modifier = Modifier,
    dismissModifier: Modifier = Modifier,
    destructive: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = {
            // Dismissing mid-action would hide progress the user is waiting on.
            if (!busy) onDismissRequest()
        },
        modifier = modifier,
        title = title,
        text = body,
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = !busy,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = if (destructive) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                ),
                modifier = Modifier
                    .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                    .then(confirmModifier),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(16.dp)
                                .testTag("harold_dialog_busy"),
                            strokeWidth = 2.dp,
                        )
                    }
                    Text(text = if (busy) busyLabel ?: confirmLabel else confirmLabel)
                }
            }
        },
        dismissButton = if (dismissLabel == null) {
            null
        } else {
            {
                TextButton(
                    onClick = onDismiss ?: onDismissRequest,
                    enabled = !busy,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .then(dismissModifier),
                ) {
                    Text(text = dismissLabel)
                }
            }
        },
    )
}
