package harold.android.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import harold.android.network.LoopbackAddress
import harold.android.ui.components.HaroldDialog

/**
 * Asks before Harold forwards a host loopback port to this device and opens
 * it in the browser. Agent output can print any address it likes, so the user
 * confirms once per link instead of the app opening it on its own.
 */
@Composable
fun DevServerLinkPrompt(
    address: LoopbackAddress,
    opening: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    HaroldDialog(
        onDismissRequest = onDismiss,
        confirmLabel = stringResource(R.string.chat_dev_server_prompt_confirm),
        onConfirm = onConfirm,
        modifier = Modifier.testTag("dev_server_prompt"),
        title = { Text(stringResource(R.string.chat_dev_server_prompt_title)) },
        body = {
            Column {
                Text(
                    text = stringResource(
                        R.string.chat_dev_server_prompt_body,
                        address.authority,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                // Addresses read as monospace everywhere else in the app, and
                // the port is the part the user needs to check before tapping.
                Text(
                    text = address.hostUrl,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        dismissLabel = stringResource(R.string.chat_dev_server_prompt_cancel),
        busy = opening,
        busyLabel = stringResource(R.string.chat_dev_server_prompt_connecting),
        confirmModifier = Modifier.testTag("dev_server_confirm"),
        dismissModifier = Modifier.testTag("dev_server_cancel"),
    )
}

/** Shown when the forward could not be opened, so the tap is never silent. */
@Composable
fun DevServerLinkErrorDialog(
    message: String,
    onDismiss: () -> Unit,
) {
    HaroldDialog(
        onDismissRequest = onDismiss,
        confirmLabel = stringResource(R.string.chat_dev_server_error_close),
        onConfirm = onDismiss,
        modifier = Modifier.testTag("dev_server_error"),
        title = { Text(stringResource(R.string.chat_dev_server_error_title)) },
        body = { Text(message) },
    )
}
