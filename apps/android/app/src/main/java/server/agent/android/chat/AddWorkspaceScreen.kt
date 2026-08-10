package server.agent.android.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import server.agent.android.R
import server.agent.android.contracts.FilesystemDirectory

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddWorkspaceScreen(
    uiState: AddWorkspaceUiState,
    onBack: () -> Unit,
    onNameChanged: (String) -> Unit,
    onRootChanged: (String) -> Unit,
    onFolderChanged: (String) -> Unit,
    onFolderQueryChanged: (String) -> Unit,
    onSubmit: () -> Unit,
    onCreated: () -> Unit,
) {
    LaunchedEffect(uiState.created) {
        if (uiState.created) {
            onCreated()
        }
    }

    val backContentDescription = stringResource(R.string.add_workspace_back_content_description)
    val formDisabled = uiState.hasNoRoots || uiState.rootsLoadState is RootsLoadState.Loading

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.add_workspace_title)) },
                navigationIcon = {
                    TextButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .semantics {
                                contentDescription = backContentDescription
                            }
                            .testTag("add_workspace_back"),
                    ) {
                        Text(text = stringResource(R.string.add_workspace_back))
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
                .testTag("add_workspace_screen"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when (val roots = uiState.rootsLoadState) {
                RootsLoadState.Loading -> {
                    Text(
                        text = stringResource(R.string.add_workspace_roots_loading),
                        modifier = Modifier
                            .testTag("add_workspace_roots_loading")
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }

                RootsLoadState.Empty -> {
                    Text(
                        text = stringResource(R.string.add_workspace_no_roots),
                        modifier = Modifier
                            .testTag("add_workspace_no_roots")
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }

                is RootsLoadState.Error -> {
                    Text(
                        text = roots.message,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .testTag("add_workspace_roots_error")
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }

                is RootsLoadState.Loaded -> {
                    RootDropdown(
                        roots = roots.roots,
                        selectedRoot = uiState.selectedRoot,
                        enabled = !formDisabled && !uiState.submitting,
                        onRootChanged = onRootChanged,
                    )
                }
            }

            OutlinedTextField(
                value = uiState.name,
                onValueChange = onNameChanged,
                label = { Text(text = stringResource(R.string.add_workspace_name_label)) },
                enabled = !formDisabled && !uiState.submitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("add_workspace_name"),
            )

            FolderPicker(
                uiState = uiState,
                enabled = !formDisabled &&
                    uiState.selectedRoot.isNotEmpty() &&
                    !uiState.submitting &&
                    uiState.foldersLoadState !is FoldersLoadState.Loading,
                onFolderChanged = onFolderChanged,
                onFolderQueryChanged = onFolderQueryChanged,
            )

            if (uiState.submitError != null) {
                Text(
                    text = uiState.submitError,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .testTag("add_workspace_submit_error")
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }

            Button(
                onClick = onSubmit,
                enabled = uiState.canSubmit,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                    .testTag("add_workspace_submit"),
            ) {
                Text(
                    text = if (uiState.submitting) {
                        stringResource(R.string.add_workspace_submitting)
                    } else {
                        stringResource(R.string.add_workspace_submit)
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RootDropdown(
    roots: List<String>,
    selectedRoot: String,
    enabled: Boolean,
    onRootChanged: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = selectedRoot.ifEmpty { stringResource(R.string.add_workspace_root_placeholder) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { if (enabled) expanded = !expanded },
    ) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            label = { Text(text = stringResource(R.string.add_workspace_root_label)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth()
                .testTag("add_workspace_root"),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            roots.forEach { root ->
                DropdownMenuItem(
                    text = { Text(text = root) },
                    onClick = {
                        onRootChanged(root)
                        expanded = false
                    },
                    modifier = Modifier.testTag("add_workspace_root_option"),
                )
            }
        }
    }
}

@Composable
private fun FolderPicker(
    uiState: AddWorkspaceUiState,
    enabled: Boolean,
    onFolderChanged: (String) -> Unit,
    onFolderQueryChanged: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.add_workspace_folder_label),
            style = MaterialTheme.typography.titleSmall,
        )

        when (val folders = uiState.foldersLoadState) {
            FoldersLoadState.Idle -> {
                Text(
                    text = stringResource(R.string.add_workspace_folder_select_root),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("add_workspace_folder_idle"),
                )
            }

            FoldersLoadState.Loading -> {
                Text(
                    text = stringResource(R.string.add_workspace_folders_loading),
                    modifier = Modifier
                        .testTag("add_workspace_folders_loading")
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }

            FoldersLoadState.Empty -> {
                Text(
                    text = stringResource(R.string.add_workspace_folders_empty),
                    modifier = Modifier
                        .testTag("add_workspace_folders_empty")
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }

            is FoldersLoadState.Error -> {
                Text(
                    text = folders.message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .testTag("add_workspace_folders_error")
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }

            is FoldersLoadState.Loaded -> {
                OutlinedTextField(
                    value = uiState.folderQuery,
                    onValueChange = onFolderQueryChanged,
                    enabled = enabled,
                    label = { Text(text = stringResource(R.string.add_workspace_folder_search)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("add_workspace_folder_search"),
                )

                val filtered = uiState.filteredFolders
                if (filtered.isEmpty()) {
                    Text(
                        text = stringResource(R.string.add_workspace_folder_search_empty),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.testTag("add_workspace_folder_search_empty"),
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 280.dp)
                            .testTag("add_workspace_folder_list"),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(filtered, key = { folder -> folder.path }) { folder ->
                            FolderRow(
                                folder = folder,
                                selected = folder.path == uiState.selectedFolderPath,
                                enabled = enabled,
                                onClick = { onFolderChanged(folder.path) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FolderRow(
    folder: FilesystemDirectory,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 4.dp)
            .testTag("add_workspace_folder_${folder.name}"),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = folder.name,
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurface
            },
        )
        Text(
            text = folder.path,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
