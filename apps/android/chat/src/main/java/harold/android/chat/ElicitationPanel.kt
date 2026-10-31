package harold.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import harold.android.live.Elicitation

private val MIN_TOUCH_TARGET = 48.dp

/**
 * The card above the composer plus the queue of URL prompts already opened and
 * waiting for the agent to finish. The active request wins the card; the rest
 * of the queue stays visible below it.
 */
@Composable
fun ElicitationPanel(
    uiState: ChatUiState,
    onAnswer: () -> Unit,
    onOpenWaitingUrl: (String) -> Unit,
    onDismissWaitingUrl: (String) -> Unit,
    onCancelRequest: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val active = uiState.activeElicitation
    if (active == null && uiState.urlElicitationsWaiting.isEmpty()) {
        return
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        when (active) {
            null -> Unit
            is Elicitation.Unsupported -> {
                ElicitationFallbackCard(
                    elicitation = active,
                    onCancel = onCancelRequest,
                )
            }

            else -> {
                ElicitationCard(
                    elicitation = active,
                    onAnswer = onAnswer,
                )
            }
        }

        uiState.urlElicitationsWaiting.forEach { request ->
            ElicitationUrlWaitingCard(
                elicitation = request,
                completed = request.requestId in uiState.completedElicitationIds,
                onOpenAgain = { onOpenWaitingUrl(request.url) },
                onDismiss = { onDismissWaitingUrl(request.requestId) },
            )
        }
    }
}

@Composable
fun ElicitationCard(
    elicitation: Elicitation,
    onAnswer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val extra = elicitation.extraQuestionCount()
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("elicitation_card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = elicitation.cardTitle(),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.testTag("elicitation_card_title"),
                )
                if (extra > 0) {
                    Text(
                        text = "+$extra more",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.testTag("elicitation_card_more"),
                    )
                }
            }
            TextButton(
                onClick = onAnswer,
                modifier = Modifier
                    .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                    .testTag("elicitation_answer_button"),
            ) {
                Text(
                    text = if (elicitation is Elicitation.Form) "Answer" else "Open",
                )
            }
        }
    }
}

@Composable
fun ElicitationFallbackCard(
    elicitation: Elicitation.Unsupported,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by rememberSaveable(elicitation.requestId) { mutableStateOf(false) }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("elicitation_fallback"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = "This request cannot be displayed",
                style = MaterialTheme.typography.bodyMedium,
            )
            elicitation.reason?.takeIf { it.isNotBlank() }?.let { reason ->
                Text(
                    text = reason,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(
                onClick = { expanded = !expanded },
                modifier = Modifier
                    .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                    .testTag("elicitation_fallback_expand"),
            ) {
                Text(text = if (expanded) "Hide details" else "Show details")
            }
            if (expanded) {
                Text(
                    text = elicitation.raw.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.testTag("elicitation_fallback_raw"),
                )
            }
            TextButton(
                onClick = onCancel,
                modifier = Modifier
                    .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                    .testTag("elicitation_fallback_cancel"),
            ) {
                Text(text = "Cancel request")
            }
        }
    }
}

@Composable
private fun ElicitationUrlWaitingCard(
    elicitation: Elicitation.Url,
    completed: Boolean,
    onOpenAgain: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("elicitation_url_waiting"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = if (completed) "Link completed" else "Link opened. Waiting for completion",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = elicitation.host,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    onClick = onOpenAgain,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_url_open_again"),
                ) {
                    Text(text = "Open again")
                }
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("elicitation_url_dismiss"),
                ) {
                    Text(text = "Dismiss")
                }
            }
        }
    }
}
