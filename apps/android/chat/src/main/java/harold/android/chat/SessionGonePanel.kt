package harold.android.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant

@Composable
fun SessionGonePanel(
    connectionName: String,
    onStartNewSession: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val badgeShape = RoundedCornerShape(10.dp)
    val host = connectionName.ifBlank { "the host" }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 40.dp)
            .testTag("session_gone_panel"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .background(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = badgeShape,
                )
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.error,
                    shape = badgeShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "!",
                style = MaterialTheme.typography.titleLarge,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.error,
            )
        }

        Text(
            text = stringResource(R.string.chat_session_gone_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 15.dp),
        )

        Text(
            text = stringResource(R.string.chat_session_gone_body, host),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )

        HaroldButton(
            text = stringResource(R.string.chat_session_gone_start_new),
            onClick = onStartNewSession,
            variant = HaroldButtonVariant.Primary,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 20.dp)
                .testTag("session_gone_start_new"),
        )
    }
}
