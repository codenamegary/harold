package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun RenameSessionDialog(
    renameState: RenameSessionUiState,
    onDismiss: () -> Unit,
    onNameChanged: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(text = "Rename session") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = renameState.name,
                    onValueChange = onNameChanged,
                    enabled = !renameState.submitting,
                    label = { Text(text = "Name") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("rename_session_field"),
                )

                renameState.error?.let { message ->
                    Text(
                        text = message,
                        modifier = Modifier.testTag("rename_session_error"),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onSubmit,
                enabled = !renameState.submitting,
                modifier = Modifier.testTag("rename_session_submit"),
            ) {
                Text(text = if (renameState.submitting) "Saving…" else "Save")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.testTag("rename_session_cancel"),
            ) {
                Text(text = "Cancel")
            }
        },
    )
}
