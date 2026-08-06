package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionPickerSheet(
    uiState: ChatUiState,
    onDismiss: () -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onRenameSessionClick: (SessionRow) -> Unit,
    onCreateClick: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Sessions",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.testTag("session_picker_title"),
            )

            when {
                uiState.sessionsLoading -> {
                    Text(text = "Loading sessions…")
                }

                uiState.sessionsError != null -> {
                    Text(
                        text = uiState.sessionsError,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                uiState.sessions.isEmpty() -> {
                    Text(text = "No sessions yet")
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth(),
                        contentPadding = PaddingValues(bottom = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(uiState.sessions, key = { session -> session.id }) { session ->
                            SessionPickerRow(
                                session = session,
                                onClick = { onSessionClick(session) },
                                onRenameClick = { onRenameSessionClick(session) },
                            )
                        }
                    }
                }
            }

            Button(
                onClick = onCreateClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("create_session_button"),
            ) {
                Text(text = "New session")
            }
        }
    }
}

@Composable
private fun SessionPickerRow(
    session: SessionRow,
    onClick: () -> Unit,
    onRenameClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("session_row_${session.id}"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(text = session.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = "${session.workspaceLabel} · ${session.agentLabel}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = sessionStatusLabel(session.state),
                    style = MaterialTheme.typography.labelSmall,
                )
            }

            TextButton(
                onClick = onRenameClick,
                modifier = Modifier.testTag("session_rename_${session.id}"),
            ) {
                Text(text = "Rename")
            }
        }
    }
}
