package server.agent.android.chat.auth

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import server.agent.android.R
import server.agent.android.contracts.AgentAuthStatus
import server.agent.android.contracts.AgentAuthSummary

private val MIN_TOUCH_TARGET = 48.dp

@Composable
fun AgentAuthBadge(
    agentName: String,
    summary: AgentAuthSummary,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = authStatusLabel(summary.status)
    val colors = authStatusColors(summary.status)
    val contentDescription = stringResource(
        R.string.agent_auth_badge_content_description,
        agentName,
        label,
    )

    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = colors.content,
        modifier = modifier
            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
            .border(width = 1.dp, color = colors.border, shape = RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 4.dp)
            .testTag("agent_auth_badge")
            .semantics { this.contentDescription = contentDescription },
    )
}

@Composable
fun authStatusLabel(status: AgentAuthStatus): String = when (status) {
    AgentAuthStatus.Unknown -> stringResource(R.string.agent_auth_status_unknown)
    AgentAuthStatus.NeedsAuth -> stringResource(R.string.agent_auth_status_needs_auth)
    AgentAuthStatus.Authenticated -> stringResource(R.string.agent_auth_status_authenticated)
    AgentAuthStatus.Error -> stringResource(R.string.agent_auth_status_error)
}

@Composable
private fun authStatusColors(status: AgentAuthStatus): AuthStatusColors = when (status) {
    AgentAuthStatus.Unknown -> AuthStatusColors(
        border = MaterialTheme.colorScheme.outlineVariant,
        content = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    AgentAuthStatus.NeedsAuth -> AuthStatusColors(
        border = Color(0xFFD97706).copy(alpha = 0.4f),
        content = Color(0xFFFDE68A),
    )
    AgentAuthStatus.Authenticated -> AuthStatusColors(
        border = MaterialTheme.colorScheme.primary.copy(alpha = 0.4f),
        content = MaterialTheme.colorScheme.primary,
    )
    AgentAuthStatus.Error -> AuthStatusColors(
        border = MaterialTheme.colorScheme.error.copy(alpha = 0.4f),
        content = MaterialTheme.colorScheme.error,
    )
}

private data class AuthStatusColors(
    val border: Color,
    val content: Color,
)
