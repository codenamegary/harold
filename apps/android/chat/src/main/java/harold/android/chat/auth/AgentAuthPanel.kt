package harold.android.chat.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import harold.android.chat.R
import harold.android.contracts.AgentAuthSummary

@Composable
fun AgentAuthPanel(
    agentName: String,
    summary: AgentAuthSummary,
    error: String?,
    modifier: Modifier = Modifier,
) {
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

            Text(
                text = stringResource(R.string.agent_auth_manage_on_host, agentName),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.testTag("agent_auth_manage_on_host"),
            )

            summary.error?.takeIf { it.isNotBlank() }?.let { summaryError ->
                Text(
                    text = summaryError,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("agent_auth_summary_error"),
                )
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
