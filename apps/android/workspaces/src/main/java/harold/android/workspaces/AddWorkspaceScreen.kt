package harold.android.workspaces

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.CreateNewFolder
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.FolderSpecial
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.ui.components.AgentButtonSize
import harold.android.ui.components.AgentButtonVariant
import harold.android.ui.components.AgentChip
import harold.android.ui.components.AgentIconButton
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonSize
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldCard
import harold.android.ui.components.RemoteFolderBrowser

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
    onConnectionChanged: (String) -> Unit = {},
) {
    val backContentDescription = stringResource(R.string.add_workspace_back_content_description)
    var newFolderOpen by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.add_workspace_title),
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                    )
                },
                navigationIcon = {
                    AgentIconButton(
                        onClick = onBack,
                        icon = {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = null,
                            )
                        },
                        contentDescription = backContentDescription,
                        variant = AgentButtonVariant.Ghost,
                        modifier = Modifier.testTag("add_workspace_back"),
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .testTag("add_workspace_screen"),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (uiState.connections.size > 1) {
                HaroldServerDropdown(
                    connections = uiState.connections,
                    selectedConnectionId = uiState.selectedConnectionId,
                    enabled = !uiState.submitting,
                    onConnectionChanged = onConnectionChanged,
                )
            }

            ModeSelector(
                mode = uiState.mode,
                enabled = !uiState.submitting,
                onModeChanged = onModeChanged,
            )

            RemoteFolderBrowser(
                path = uiState.browserPath,
                parent = uiState.browserParent,
                folders = uiState.folders,
                loading = uiState.browserLoadState is BrowserLoadState.Loading,
                error = (uiState.browserLoadState as? BrowserLoadState.Error)?.message,
                enabled = !uiState.submitting,
                query = uiState.folderQuery,
                selectedPath = uiState.selectedFolderPath,
                testTagPrefix = "add_workspace",
                onOpenFolder = onFolderSelected,
                onUp = onBrowserUp,
                onQueryChanged = onFolderQueryChanged,
                onUseCurrent = onUseCurrentFolder,
                onNewFolder = {
                    newFolderName = ""
                    newFolderOpen = true
                },
            )

            if (uiState.isClone) {
                HaroldCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        OutlinedTextField(
                            value = uiState.cloneUrl,
                            onValueChange = onCloneUrlChanged,
                            label = { Text(text = stringResource(R.string.add_workspace_clone_url_label)) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Filled.Link,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            singleLine = true,
                            enabled = !uiState.submitting,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("add_workspace_clone_url"),
                        )

                        OutlinedTextField(
                            value = uiState.cloneFolderName,
                            onValueChange = onCloneFolderNameChanged,
                            label = { Text(text = stringResource(R.string.add_workspace_clone_folder_label)) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Filled.Folder,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            singleLine = true,
                            enabled = !uiState.submitting,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("add_workspace_clone_folder_name"),
                        )

                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.5f),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                LabeledValue(
                                    label = stringResource(R.string.add_workspace_clone_parent_label),
                                    value = uiState.cloneParent.ifEmpty { "—" },
                                    testTag = "add_workspace_clone_parent",
                                )
                                LabeledValue(
                                    label = stringResource(R.string.add_workspace_final_path_label),
                                    value = uiState.finalPath.ifEmpty { "—" },
                                    testTag = "add_workspace_final_path",
                                    highlight = true,
                                )
                            }
                        }
                    }
                }
            } else {
                HaroldCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                            modifier = Modifier.size(40.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Filled.FolderSpecial,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(22.dp),
                                )
                            }
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.add_workspace_selected_folder),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = uiState.selectedFolderPath.ifEmpty { "—" },
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.testTag("add_workspace_selected_folder"),
                            )
                        }
                    }
                }
            }

            HaroldCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = uiState.name,
                        onValueChange = onNameChanged,
                        label = { Text(text = stringResource(R.string.add_workspace_name_label)) },
                        singleLine = true,
                        enabled = !uiState.submitting,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("add_workspace_name"),
                    )
                }
            }

            if (uiState.submitError != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.ErrorOutline,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Text(
                            text = uiState.submitError,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier
                                .testTag("add_workspace_submit_error")
                                .semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                }
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
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.CreateNewFolder,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(text = stringResource(R.string.add_workspace_new_folder_title))
                }
            },
            text = {
                OutlinedTextField(
                    value = newFolderName,
                    onValueChange = { newFolderName = it },
                    label = { Text(text = stringResource(R.string.add_workspace_new_folder_label)) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("add_workspace_new_folder_name"),
                )
            },
            confirmButton = {
                HaroldButton(
                    text = stringResource(R.string.add_workspace_new_folder_create),
                    onClick = {
                        onCreateFolder(newFolderName)
                        newFolderOpen = false
                    },
                    enabled = newFolderName.isNotBlank() && !uiState.submitting,
                    size = HaroldButtonSize.Small,
                    variant = HaroldButtonVariant.Primary,
                    modifier = Modifier.testTag("add_workspace_new_folder_confirm"),
                )
            },
            dismissButton = {
                HaroldButton(
                    text = stringResource(R.string.add_workspace_new_folder_cancel),
                    onClick = { newFolderOpen = false },
                    size = HaroldButtonSize.Small,
                    variant = HaroldButtonVariant.Ghost,
                    modifier = Modifier.testTag("add_workspace_new_folder_cancel"),
                )
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
    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        AgentChip(
            onClick = { onModeChanged(AddWorkspaceMode.OpenFolder) },
            enabled = enabled,
            label = stringResource(R.string.add_workspace_mode_open),
            variant = if (mode == AddWorkspaceMode.OpenFolder) AgentButtonVariant.Primary else AgentButtonVariant.Frosted,
            size = AgentButtonSize.Medium,
            leadingIcon = {
                Icon(
                    imageVector = Icons.Filled.Folder,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
            },
            modifier = Modifier.testTag("add_workspace_mode_open"),
        )
        AgentChip(
            onClick = { onModeChanged(AddWorkspaceMode.CloneRepo) },
            enabled = enabled,
            label = stringResource(R.string.add_workspace_mode_clone),
            variant = if (mode == AddWorkspaceMode.CloneRepo) AgentButtonVariant.Primary else AgentButtonVariant.Frosted,
            size = AgentButtonSize.Medium,
            leadingIcon = {
                Icon(
                    imageVector = Icons.Filled.CloudDownload,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
            },
            modifier = Modifier.testTag("add_workspace_mode_clone"),
        )
    }
}

@Composable
private fun LabeledValue(
    label: String,
    value: String,
    testTag: String,
    highlight: Boolean = false,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal,
            ),
            color = if (highlight) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.testTag(testTag),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HaroldServerDropdown(
    connections: List<WorkspaceConnectionBadge>,
    selectedConnectionId: String,
    enabled: Boolean,
    onConnectionChanged: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = connections.firstOrNull { it.connectionId == selectedConnectionId } ?: connections.firstOrNull()

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
            shape = RoundedCornerShape(12.dp),
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
            connections.forEach { connection ->
                DropdownMenuItem(
                    leadingIcon = {
                        HaroldBadge(
                            colorId = connection.colorId,
                            iconId = connection.iconId,
                            size = 22.dp,
                        )
                    },
                    text = { Text(text = connection.name) },
                    onClick = {
                        onConnectionChanged(connection.connectionId)
                        expanded = false
                    },
                    modifier = Modifier.testTag("add_workspace_harold_${connection.connectionId}"),
                )
            }
        }
    }
}
