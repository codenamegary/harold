package harold.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import harold.android.R
import harold.android.contracts.PermissionRequest

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PermissionPanel(
    request: PermissionRequest,
    sessionName: String,
    submittingOptionId: String?,
    error: String?,
    onSelectOption: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("permission_panel"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Permission required for ${request.toolName}",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("permission_tool_name"),
            )
            Text(
                text = "Session: $sessionName",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.testTag("permission_session_name"),
            )

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                request.options.forEach { option ->
                    val optionContentDescription = stringResource(
                        R.string.permission_option_content_description,
                        option.name,
                    )
                    TextButton(
                        onClick = { onSelectOption(option.optionId) },
                        enabled = submittingOptionId == null,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("permission_option_${option.optionId}")
                            .semantics {
                                contentDescription = optionContentDescription
                            },
                    ) {
                        Text(
                            text = if (submittingOptionId == option.optionId) {
                                "Submitting…"
                            } else {
                                option.name
                            },
                        )
                    }
                }
            }

            error?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("permission_error"),
                )
            }
        }
    }
}
