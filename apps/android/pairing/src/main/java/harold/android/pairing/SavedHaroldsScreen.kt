package harold.android.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavedHaroldsScreen(
    uiState: SavedHaroldsUiState,
    onBack: () -> Unit,
    onEdit: (String) -> Unit,
    onRemove: (String) -> Unit,
    onNameChanged: (String) -> Unit,
    onColorSelected: (String) -> Unit,
    onIconSelected: (String) -> Unit,
    onSave: () -> Unit,
    onCancelEdit: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.saved_harolds_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("saved_harolds_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.saved_harolds_back),
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            uiState.rows.forEach { row ->
                Column(modifier = Modifier.fillMaxWidth().testTag("saved_harold_${row.serverOrigin}")) {
                    Text(
                        text = row.name,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "${row.colorId} · ${row.iconId}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    TextButton(
                        onClick = { onEdit(row.serverOrigin) },
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("saved_harold_edit_${row.serverOrigin}"),
                    ) {
                        Text(text = stringResource(R.string.saved_harolds_edit))
                    }
                    TextButton(
                        onClick = { onRemove(row.serverOrigin) },
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("saved_harold_remove_${row.serverOrigin}"),
                    ) {
                        Text(text = stringResource(R.string.saved_harolds_remove))
                    }
                }
            }

            if (uiState.editingOrigin != null) {
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = uiState.name,
                    onValueChange = onNameChanged,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("saved_harold_name"),
                    label = { Text(text = stringResource(R.string.pairing_name_label)) },
                    singleLine = true,
                )
                Text(text = stringResource(R.string.pairing_color_label))
                haroldColorIds.forEach { id ->
                    TextButton(
                        onClick = { onColorSelected(id) },
                        modifier = Modifier.testTag("saved_harold_color_$id"),
                    ) {
                        Text(text = if (id == uiState.colorId) "$id selected" else id)
                    }
                }
                Text(text = stringResource(R.string.pairing_icon_label))
                haroldIconIds.forEach { id ->
                    TextButton(
                        onClick = { onIconSelected(id) },
                        modifier = Modifier.testTag("saved_harold_icon_$id"),
                    ) {
                        Text(text = if (id == uiState.iconId) "$id selected" else id)
                    }
                }
                Button(
                    onClick = onSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("saved_harold_save"),
                ) {
                    Text(text = stringResource(R.string.saved_harolds_save))
                }
                TextButton(
                    onClick = onCancelEdit,
                    modifier = Modifier.testTag("saved_harold_cancel"),
                ) {
                    Text(text = stringResource(R.string.pairing_cancel))
                }
            }
        }
    }
}
