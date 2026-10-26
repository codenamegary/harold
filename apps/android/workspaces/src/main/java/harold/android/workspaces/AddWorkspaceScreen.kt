package harold.android.workspaces

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import harold.android.contracts.FilesystemDirectory
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddWorkspaceScreen(
    uiState: AddWorkspaceUiState,
    onBack: () -> Unit,
    onModeChanged: (AddWorkspaceMode) -> Unit,
    onNameChanged: (String) -> Unit,
    onFolderSelected: (String) -> Unit,
    onBrowserUp: () -> Unit,
    onUseCurrentFolder: () -> Unit,
    onFolderQueryChanged: (String) -> Unit,
    onCreateFolder: (String) -> Unit,
    onCloneUrlChanged: (String) -> Unit,
    onCloneFolderNameChanged: (String) -> Unit,
    onSubmit: () -> Unit,
    onHaroldChanged: (String) -> Unit = {},
) {
    val backContentDescription = stringResource(R.string.add_workspace_back_content_description)
    var newFolderOpen by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.add_workspace_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .semantics {
                                contentDescription = backContentDescription
                            }
                            .testTag("add_workspace_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
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
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
                .testTag("add_workspace_screen"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (uiState.harolds.size > 1) {
                HaroldServerDropdown(
                    harolds = uiState.harolds,
                    selectedServerOrigin = uiState.selectedServerOrigin,
                    enabled = !uiState.submitting,
                    onHaroldChanged = onHaroldChanged,
                )
            }

            ModeSelector(
                mode = uiState.mode,
                enabled = !uiState.submitting,
                onModeChanged = onModeChanged,
            )

            Browser(
                uiState = uiState,
                enabled = !uiState.submitting,
                onFolderSelected = onFolderSelected,
                onBrowserUp = onBrowserUp,
                onUseCurrentFolder = onUseCurrentFolder,
                onFolderQueryChanged = onFolderQueryChanged,
                onNewFolderClick = {
                    newFolderName = ""
                    newFolderOpen = true
                },
            )

            if (uiState.isClone) {
                OutlinedTextField(
                    value = uiState.cloneUrl,
                    onValueChange = onCloneUrlChanged,
                    label = { Text(text = stringResource(R.string.add_workspace_clone_url_label)) },
                    singleLine = true,
                    enabled = !uiState.submitting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("add_workspace_clone_url"),
                )

                OutlinedTextField(
                    value = uiState.cloneFolderName,
                    onValueChange = onCloneFolderNameChanged,
                    label = { Text(text = stringResource(R.string.add_workspace_clone_folder_label)) },
                    singleLine = true,
                    enabled = !uiState.submitting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("add_workspace_clone_folder_name"),
                )

                LabeledValue(
                    label = stringResource(R.string.add_workspace_clone_parent_label),
                    value = uiState.cloneParent.ifEmpty { "—" },
                    testTag = "add_workspace_clone_parent",
                )

                LabeledValue(
                    label = stringResource(R.string.add_workspace_final_path_label),
                    value = uiState.finalPath.ifEmpty { "—" },
                    testTag = "add_workspace_final_path",
                )
            } else {
                LabeledValue(
                    label = stringResource(R.string.add_workspace_selected_folder),
                    value = uiState.selectedFolderPath.ifEmpty { "—" },
                    testTag = "add_workspace_selected_folder",
                )
            }

            OutlinedTextField(
                value = uiState.name,
                onValueChange = onNameChanged,
                label = { Text(text = stringResource(R.string.add_workspace_name_label)) },
                enabled = !uiState.submitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("add_workspace_name"),
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

            HaroldButton(
                text = if (uiState.submitting) {
                    stringResource(R.string.add_workspace_submitting)
                } else {
                    stringResource(R.string.add_workspace_submit)
                },
                onClick = onSubmit,
                enabled = uiState.canSubmit,
                variant = HaroldButtonVariant.Primary,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("add_workspace_submit"),
            )
        }
    }

    if (newFolderOpen) {
        AlertDialog(
            onDismissRequest = { newFolderOpen = false },
            title = { Text(text = stringResource(R.string.add_workspace_new_folder_title)) },
            text = {
                OutlinedTextField(
                    value = newFolderName,
                    onValueChange = { newFolderName = it },
                    label = { Text(text = stringResource(R.string.add_workspace_new_folder_label)) },
                    singleLine = true,
                    modifier = Modifier.testTag("add_workspace_new_folder_name"),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        onCreateFolder(newFolderName)
                        newFolderOpen = false
                    },
                    enabled = newFolderName.isNotBlank() && !uiState.submitting,
                    modifier = Modifier.testTag("add_workspace_new_folder_confirm"),
                ) {
                    Text(text = stringResource(R.string.add_workspace_new_folder_create))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { newFolderOpen = false },
                    modifier = Modifier.testTag("add_workspace_new_folder_cancel"),
                ) {
                    Text(text = stringResource(R.string.add_workspace_new_folder_cancel))
                }
            },
        )
    }
}

@Composable
private fun ModeSelector(
    mode: AddWorkspaceMode,
    enabled: Boolean,
    onModeChanged: (AddWorkspaceMode) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(
            selected = mode == AddWorkspaceMode.OpenFolder,
            onClick = { onModeChanged(AddWorkspaceMode.OpenFolder) },
            enabled = enabled,
            label = { Text(text = stringResource(R.string.add_workspace_mode_open)) },
            modifier = Modifier.testTag("add_workspace_mode_open"),
        )
        FilterChip(
            selected = mode == AddWorkspaceMode.CloneRepo,
            onClick = { onModeChanged(AddWorkspaceMode.CloneRepo) },
            enabled = enabled,
            label = { Text(text = stringResource(R.string.add_workspace_mode_clone)) },
            modifier = Modifier.testTag("add_workspace_mode_clone"),
        )
    }
}

@Composable
private fun Browser(
    uiState: AddWorkspaceUiState,
    enabled: Boolean,
    onFolderSelected: (String) -> Unit,
    onBrowserUp: () -> Unit,
    onUseCurrentFolder: () -> Unit,
    onFolderQueryChanged: (String) -> Unit,
    onNewFolderClick: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.add_workspace_browser_path),
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text = uiState.browserPath.ifEmpty { "—" },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.testTag("add_workspace_browser_path"),
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(
                onClick = onBrowserUp,
                enabled = enabled && uiState.browserParent != null,
                modifier = Modifier.testTag("add_workspace_browser_up"),
            ) {
                Text(text = stringResource(R.string.add_workspace_browser_up))
            }
            TextButton(
                onClick = onNewFolderClick,
                enabled = enabled && uiState.browserPath.isNotEmpty(),
                modifier = Modifier.testTag("add_workspace_new_folder"),
            ) {
                Text(text = stringResource(R.string.add_workspace_new_folder))
            }
        }

        when (val browser = uiState.browserLoadState) {
            BrowserLoadState.Loading -> {
                Text(
                    text = stringResource(R.string.add_workspace_folders_loading),
                    modifier = Modifier
                        .testTag("add_workspace_folders_loading")
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }

            is BrowserLoadState.Error -> {
                Text(
                    text = browser.message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .testTag("add_workspace_browser_error")
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }

            is BrowserLoadState.Loaded -> {
                OutlinedTextField(
                    value = uiState.folderQuery,
                    onValueChange = onFolderQueryChanged,
                    enabled = enabled,
                    label = { Text(text = stringResource(R.string.add_workspace_folder_search)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("add_workspace_folder_search"),
                )

                if (browser.folders.isEmpty()) {
                    Text(
                        text = stringResource(R.string.add_workspace_folders_empty),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.testTag("add_workspace_folders_empty"),
                    )
                } else {
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
                                .heightIn(max = 220.dp)
                                .testTag("add_workspace_folder_list"),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            items(filtered, key = { folder -> folder.path }) { folder ->
                                FolderRow(
                                    folder = folder,
                                    enabled = enabled,
                                    onClick = { onFolderSelected(folder.path) },
                                )
                            }
                        }
                    }
                }

                TextButton(
                    onClick = onUseCurrentFolder,
                    enabled = enabled,
                    modifier = Modifier.testTag("add_workspace_use_current"),
                ) {
                    Text(text = stringResource(R.string.add_workspace_use_current))
                }
            }
        }
    }
}

@Composable
private fun LabeledValue(
    label: String,
    value: String,
    testTag: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.testTag(testTag),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HaroldServerDropdown(
    harolds: List<WorkspaceHaroldBadge>,
    selectedServerOrigin: String,
    enabled: Boolean,
    onHaroldChanged: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = harolds.firstOrNull { it.serverOrigin == selectedServerOrigin } ?: harolds.firstOrNull()

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { if (enabled) expanded = !expanded },
    ) {
        OutlinedTextField(
            value = selected?.name.orEmpty(),
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            label = { Text(text = "Harold") },
            leadingIcon = if (selected != null) {
                {
                    HaroldBadge(
                        colorId = selected.colorId,
                        iconId = selected.iconId,
                        size = 22.dp,
                    )
                }
            } else {
                null
            },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable, enabled = enabled)
                .fillMaxWidth()
                .testTag("add_workspace_harold"),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            harolds.forEach { harold ->
                DropdownMenuItem(
                    leadingIcon = {
                        HaroldBadge(
                            colorId = harold.colorId,
                            iconId = harold.iconId,
                            size = 22.dp,
                        )
                    },
                    text = { Text(text = harold.name) },
                    onClick = {
                        onHaroldChanged(harold.serverOrigin)
                        expanded = false
                    },
                    modifier = Modifier.testTag("add_workspace_harold_${harold.serverOrigin}"),
                )
            }
        }
    }
}

@Composable
private fun FolderRow(
    folder: FilesystemDirectory,
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
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = folder.path,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
