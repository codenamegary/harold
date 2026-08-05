package server.agent.android.shell

import android.content.res.Configuration
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import server.agent.android.R
import server.agent.android.ui.theme.AgentServerTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShellScreen(
    uiState: ShellUiState,
    onPairClick: () -> Unit,
) {
    val pairContentDescription = stringResource(R.string.pair_content_description)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.title,
                        modifier = Modifier.testTag("shell_title"),
                    )
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Text(
                    text = uiState.status,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(horizontal = 24.dp, vertical = 16.dp)
                        .testTag("shell_status"),
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = onPairClick,
                enabled = uiState.pairEnabled,
                modifier = Modifier
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("shell_pair_button")
                    .semantics {
                        contentDescription = pairContentDescription
                    },
            ) {
                Text(text = uiState.pairLabel)
            }
        }
    }
}

@Preview(name = "Not paired", showBackground = true)
@Preview(
    name = "Not paired dark",
    showBackground = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Composable
private fun ShellScreenPreview() {
    AgentServerTheme(dynamicColor = false) {
        ShellScreen(
            uiState = ShellUiState(),
            onPairClick = {},
        )
    }
}
