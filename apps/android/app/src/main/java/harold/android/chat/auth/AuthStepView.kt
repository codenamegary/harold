package harold.android.chat.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import harold.android.R
import harold.android.contracts.AuthDoneOutcome
import harold.android.contracts.AuthShowMessageLevel
import harold.android.contracts.AuthStep
import harold.android.ui.components.AgentButton
import harold.android.ui.components.AgentButtonSize
import harold.android.ui.components.AgentButtonVariant

private val MIN_TOUCH_TARGET = 48.dp

@Composable
fun AuthStepView(
    step: AuthStep,
    confirmDisabled: Boolean,
    confirming: Boolean,
    onConfirm: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (step) {
        is AuthStep.ShowMessage -> {
            Text(
                text = step.body,
                style = MaterialTheme.typography.bodyMedium,
                color = if (step.level == AuthShowMessageLevel.Error) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                modifier = modifier
                    .testTag("auth_step_show_message")
                    .semantics {
                        if (step.level == AuthShowMessageLevel.Error) {
                            liveRegion = LiveRegionMode.Assertive
                        }
                    },
            )
        }
        is AuthStep.Confirm -> {
            Column(
                modifier = modifier.testTag("auth_step_confirm"),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = step.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = step.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                AgentButton(
                    onClick = { onConfirm(step.stepId) },
                    enabled = !confirmDisabled && !confirming,
                    variant = AgentButtonVariant.Secondary,
                    size = AgentButtonSize.Small,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("auth_step_confirm_button"),
                ) {
                    Text(
                        text = if (confirming) {
                            stringResource(R.string.agent_auth_confirming)
                        } else {
                            step.confirmLabel
                        },
                    )
                }
            }
        }
        is AuthStep.Working -> {
            Text(
                text = step.label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = modifier
                    .testTag("auth_step_working")
                    .semantics {
                        liveRegion = LiveRegionMode.Polite
                    },
            )
        }
        is AuthStep.Done -> {
            val fallback = when (step.outcome) {
                AuthDoneOutcome.Succeeded -> stringResource(R.string.agent_auth_done_succeeded)
                AuthDoneOutcome.Cancelled -> stringResource(R.string.agent_auth_done_cancelled)
                AuthDoneOutcome.Failed -> stringResource(R.string.agent_auth_done_failed)
            }
            Text(
                text = step.message ?: fallback,
                style = MaterialTheme.typography.bodyMedium,
                color = if (step.outcome == AuthDoneOutcome.Failed) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = modifier.testTag("auth_step_done"),
            )
        }
    }
}
