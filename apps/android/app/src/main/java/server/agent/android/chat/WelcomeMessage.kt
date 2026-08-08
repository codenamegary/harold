package server.agent.android.chat

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
import server.agent.android.R

@Composable
fun WelcomeMessage(
    modifier: Modifier = Modifier,
    body: String = stringResource(R.string.chat_welcome_body),
    action: (@Composable () -> Unit)? = null,
) {
    val badgeShape = RoundedCornerShape(10.dp)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 40.dp)
            .testTag("chat_welcome"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .background(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = badgeShape,
                )
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.outline,
                    shape = badgeShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "›_",
                style = MaterialTheme.typography.bodyMedium,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Text(
            text = stringResource(R.string.chat_welcome_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 15.dp),
        )

        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )

        if (action != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 20.dp),
            ) {
                action()
            }
        }
    }
}
