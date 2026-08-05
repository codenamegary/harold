package server.agent.android.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun ShellScreen(
    uiState: ShellUiState,
    onPairClick: () -> Unit,
) {
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = uiState.title,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.testTag("shell_title"),
            )
            Text(
                text = uiState.status,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.testTag("shell_status"),
            )
            Button(
                onClick = onPairClick,
                enabled = uiState.pairEnabled,
                modifier = Modifier.testTag("shell_pair_button"),
            ) {
                Text(text = "Pair")
            }
        }
    }
}
