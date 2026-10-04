package harold.android.chat.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AuthSessionStatus
import harold.android.ui.components.AgentButton
import harold.android.ui.components.AgentButtonSize
import harold.android.ui.components.AgentButtonVariant

private val MIN_TOUCH_TARGET = 48.dp

@Composable
fun AgentAuthPanel(
    agentName: String,
    summary: AgentAuthSummary,
    auth: AgentAuth?,
    submitting: Boolean,
    actionBusy: Boolean,
    error: String?,
    onSignIn: () -> Unit,
    onConfirm: (String) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val session = auth?.session?.takeIf { it.status == AuthSessionStatus.InProgress }
    val contentDescription = stringResource(R.string.agent_auth_panel_content_description, agentName)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("agent_auth_panel")
            .semantics { this.contentDescription = contentDescription },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.agent_auth_host_login),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.testTag("agent_auth_panel_title"),
            )

            summary.error?.takeIf { it.isNotBlank() }?.let { summaryError ->
                Text(
                    text = summaryError,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("agent_auth_summary_error"),
                )
            }

            if (session != null) {
                session.steps.forEachIndexed { index, step ->
                    AuthStepView(
                        step = step,
                        confirmDisabled = actionBusy || submitting,
                        confirming = actionBusy,
                        onConfirm = onConfirm,
                        modifier = Modifier.testTag("auth_step_$index"),
                    )
                }
                TextButton(
                    onClick = onCancel,
                    enabled = !actionBusy && !submitting,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("agent_auth_cancel"),
                ) {
                    Text(text = stringResource(R.string.agent_auth_cancel))
                }
            } else {
                AgentButton(
                    onClick = onSignIn,
                    enabled = !submitting && !actionBusy,
                    variant = AgentButtonVariant.Secondary,
                    size = AgentButtonSize.Small,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("agent_auth_sign_in"),
                ) {
                    Text(
                        text = if (submitting) {
                            stringResource(R.string.agent_auth_starting)
                        } else {
                            stringResource(R.string.agent_auth_sign_in)
                        },
                    )
                }
            }

            error?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("agent_auth_error"),
                )
            }
        }
    }
}
