package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun SessionEditDialog(
    renameState: RenameSessionUiState,
    archiveSubmitting: Boolean,
    onDismiss: () -> Unit,
    onNameChanged: (String) -> Unit,
    onSave: () -> Unit,
    onArchive: () -> Unit,
) {
    val busy = renameState.submitting || archiveSubmitting
    val displayError = renameState.error ?: renameState.fieldError

    AlertDialog(
        onDismissRequest = {
            if (!busy) {
                onDismiss()
            }
        },
        title = { Text(text = "Edit session") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = renameState.name,
                    onValueChange = onNameChanged,
                    enabled = !busy,
                    singleLine = true,
                    label = { Text(text = "Name") },
                    isError = displayError != null,
                    supportingText = displayError?.let { message ->
                        {
                            Text(
                                text = message,
                                modifier = Modifier.testTag("session_edit_error"),
                            )
                        }
                    },
                    modifier = Modifier.testTag("session_edit_name"),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = onSave,
                enabled = !busy && renameState.isValid,
                modifier = Modifier.testTag("session_edit_save"),
            ) {
                Text(text = if (renameState.submitting) "Saving…" else "Save")
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(0.dp)) {
                TextButton(
                    onClick = onArchive,
                    enabled = !busy,
                    modifier = Modifier.testTag("session_edit_archive"),
                ) {
                    Text(text = if (archiveSubmitting) "Archiving…" else "Archive")
                }
                TextButton(
                    onClick = onDismiss,
                    enabled = !busy,
                    modifier = Modifier.testTag("session_edit_cancel"),
                ) {
                    Text(text = "Cancel")
                }
            }
        },
        modifier = Modifier.testTag("session_edit_dialog"),
    )
}
