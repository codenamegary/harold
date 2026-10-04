package harold.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

private val MIN_TOUCH_TARGET = 48.dp

@Composable
fun ExtensionPanel(
    uiState: ExtensionUiState,
    onReplyChanged: (String) -> Unit,
    onReply: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val request = uiState.request ?: return

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("extension_panel"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Agent request ${request.method}",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("extension_method"),
            )
            Text(
                text = encodeParams(request.params),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 160.dp)
                    .verticalScroll(rememberScrollState())
                    .testTag("extension_params"),
            )
            OutlinedTextField(
                value = uiState.replyText,
                onValueChange = onReplyChanged,
                enabled = !uiState.submitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("extension_reply"),
                label = { Text(text = "Reply JSON") },
                minLines = 3,
            )
            uiState.error?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("extension_error"),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    onClick = onReply,
                    enabled = !uiState.submitting,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("extension_send"),
                ) {
                    Text(text = if (uiState.submitting) "Sending…" else "Send reply")
                }
                TextButton(
                    onClick = onSkip,
                    enabled = !uiState.submitting,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("extension_skip"),
                ) {
                    Text(text = "Skip")
                }
            }
        }
    }
}

private fun encodeParams(params: JsonElement): String =
    runCatching { Json { prettyPrint = true }.encodeToString(JsonElement.serializer(), params) }
        .getOrElse { params.toString() }
