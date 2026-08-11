package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RenameSessionSheet(
    renameState: RenameSessionUiState,
    onDismiss: () -> Unit,
    onNameChanged: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        RenameSessionSheetContent(
            renameState = renameState,
            onDismiss = onDismiss,
            onNameChanged = onNameChanged,
            onSubmit = onSubmit,
        )
    }
}

@Composable
fun RenameSessionSheetContent(
    renameState: RenameSessionUiState,
    onDismiss: () -> Unit,
    onNameChanged: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .testTag("rename_session_sheet"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Rename session",
            style = MaterialTheme.typography.titleLarge,
        )

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
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("rename_session_error"),
            )
        }

        Button(
            onClick = onSubmit,
            enabled = !renameState.submitting,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("rename_session_submit"),
        ) {
            Text(text = if (renameState.submitting) "Saving…" else "Save")
        }

        TextButton(
            onClick = onDismiss,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("rename_session_cancel"),
        ) {
            Text(text = "Cancel")
        }
    }
}
