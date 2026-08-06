package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    uiState: ChatUiState,
    onSessionSelectorClick: () -> Unit,
    onWorkspacesClick: () -> Unit,
    onDismissPicker: () -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onCreateClick: () -> Unit,
    onDismissCreate: () -> Unit,
    onCreateWorkspaceChanged: (String) -> Unit,
    onCreateAgentChanged: (server.agent.android.contracts.AgentId) -> Unit,
    onCreatePromptChanged: (String) -> Unit,
    onCreateSubmit: () -> Unit,
    onComposerTextChanged: (String) -> Unit,
    onComposerSubmit: () -> Unit,
) {
    var menuExpanded by remember { mutableStateOf(false) }
    val sessionLabel = uiState.selectedSession?.name ?: "Select session"

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    TextButton(
                        onClick = onSessionSelectorClick,
                        modifier = Modifier.testTag("session_selector"),
                    ) {
                        Text(text = "$sessionLabel ▾")
                    }
                },
                actions = {
                    TextButton(
                        onClick = { menuExpanded = true },
                        modifier = Modifier.testTag("chat_overflow"),
                    ) {
                        Text(text = "More")
                    }

                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text(text = "Workspaces") },
                            onClick = {
                                menuExpanded = false
                                onWorkspacesClick()
                            },
                            modifier = Modifier.testTag("workspaces_menu_item"),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (uiState.connectionBanner != null) {
                Text(
                    text = uiState.connectionBanner,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.testTag("connection_banner"),
                )
            }

            if (uiState.streamReconnecting) {
                Text(
                    text = "Reconnecting session stream…",
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.testTag("stream_reconnect_banner"),
                )
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = if (uiState.transcript.rows.isEmpty()) {
                    Alignment.Center
                } else {
                    Alignment.TopStart
                },
            ) {
                ChatTranscript(
                    rows = uiState.transcript.rows,
                    showProgress = uiState.showProgress && uiState.transcript.rows.isEmpty(),
                    emptyMessage = uiState.emptyTranscriptMessage,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            uiState.composerBlockedMessage?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("composer_blocked_message"),
                )
            }

            uiState.composerError?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("composer_error"),
                )
            }

            OutlinedTextField(
                value = uiState.composerText,
                onValueChange = onComposerTextChanged,
                enabled = uiState.composerEnabled,
                label = { Text(text = "Message") },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("chat_composer"),
            )

            TextButton(
                onClick = onComposerSubmit,
                enabled = uiState.composerEnabled && uiState.composerText.isNotBlank(),
                modifier = Modifier
                    .align(Alignment.End)
                    .testTag("chat_send_button"),
            ) {
                Text(text = if (uiState.composerSubmitting) "Sending…" else "Send")
            }
        }
    }

    if (uiState.pickerVisible) {
        SessionPickerSheet(
            uiState = uiState,
            onDismiss = onDismissPicker,
            onSessionClick = onSessionClick,
            onCreateClick = onCreateClick,
        )
    }

    if (uiState.createDialogVisible) {
        CreateSessionDialog(
            createState = uiState.createState,
            onDismiss = onDismissCreate,
            onWorkspaceChanged = onCreateWorkspaceChanged,
            onAgentChanged = onCreateAgentChanged,
            onPromptChanged = onCreatePromptChanged,
            onSubmit = onCreateSubmit,
        )
    }
}
