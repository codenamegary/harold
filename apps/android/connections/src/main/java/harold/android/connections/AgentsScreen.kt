package harold.android.connections

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonSize
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldCard
import harold.android.ui.components.HaroldCheckboxRow
import harold.android.ui.components.HaroldFormSection
import harold.android.ui.components.HaroldSegmentOption
import harold.android.ui.components.HaroldSegmentedControl
import harold.android.ui.components.HaroldTextField
import harold.android.ui.components.RemoteFolderBrowser
import harold.android.ui.components.SwipeToDeleteListItem

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentsScreen(
    uiState: AgentsUiState,
    onBack: () -> Unit,
    onScan: () -> Unit,
    onReload: () -> Unit,
    onRestart: (String) -> Unit,
    onToggleEnabled: (String, Boolean) -> Unit,
    onEdit: (String) -> Unit,
    onDelete: (String) -> Unit,
    onRestore: (String) -> Unit,
    onEditDisplayNameChanged: (String) -> Unit,
    onEditPathChanged: (String) -> Unit,
    onEditArgsChanged: (String) -> Unit,
    onEditEnabledChanged: (Boolean) -> Unit,
    onSaveEdit: () -> Unit,
    onCancelEdit: () -> Unit,
    onStartCreateCustom: () -> Unit,
    onCreateNameChanged: (String) -> Unit,
    onCreatePathChanged: (String) -> Unit,
    onCreateArgsChanged: (String) -> Unit,
    onCreateCustom: () -> Unit,
    onCancelCreateCustom: () -> Unit,
    onSearchQueryChanged: (String) -> Unit = {},
    onCategorySelected: (AgentCategory) -> Unit = {},
    onEditBinDirChanged: (String) -> Unit = {},
    onEditBinDirBrowse: () -> Unit = {},
    onEditBinDirClear: () -> Unit = {},
    onCreateBinDirChanged: (String) -> Unit = {},
    onCreateBinDirBrowse: () -> Unit = {},
    onCreateBinDirClear: () -> Unit = {},
    onBinDirOpenFolder: (String) -> Unit = {},
    onBinDirUp: () -> Unit = {},
    onBinDirQueryChanged: (String) -> Unit = {},
    onBinDirUseCurrent: () -> Unit = {},
    onBinDirCancel: () -> Unit = {},
) {
    val addCustomContentDescription = stringResource(R.string.agents_custom_add)

    val displayedRows = remember(uiState.rows, uiState.selectedCategory, uiState.searchQuery) {
        val categoryRows = when (uiState.selectedCategory) {
            AgentCategory.All -> uiState.rows
            AgentCategory.Enabled -> uiState.rows.filter { it.enabled }
            AgentCategory.Popular -> uiState.rows.filter { it.popular }
        }
        val query = uiState.searchQuery.trim().lowercase()
        if (query.isEmpty()) {
            categoryRows
        } else {
            categoryRows.filter { row ->
                row.displayName.lowercase().contains(query) ||
                    row.id.lowercase().contains(query) ||
                    (row.path?.lowercase()?.contains(query) == true)
            }
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.agents_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("agents_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.agents_back),
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = onReload,
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("agents_reload"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Sync,
                            contentDescription = stringResource(R.string.agents_reload),
                        )
                    }
                    IconButton(
                        onClick = onScan,
                        enabled = !uiState.scanning,
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("agents_scan"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.agents_scan),
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            if (!uiState.showCreateCustom) {
                FloatingActionButton(
                    onClick = onStartCreateCustom,
                    modifier = Modifier
                        .testTag("agents_add_custom")
                        .semantics {
                            contentDescription = addCustomContentDescription
                        },
                ) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = null,
                    )
                }
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Search field
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = onSearchQueryChanged,
                placeholder = {
                    Text(
                        text = stringResource(R.string.agents_search_placeholder),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.Search,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                },
                trailingIcon = {
                    if (uiState.searchQuery.isNotEmpty()) {
                        IconButton(onClick = { onSearchQueryChanged("") }) {
                            Icon(
                                imageVector = Icons.Filled.Clear,
                                contentDescription = "Clear search",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("agents_search_field"),
            )

            // Category Filter Segmented Control
            HaroldSegmentedControl(
                options = listOf(
                    HaroldSegmentOption(
                        value = AgentCategory.All,
                        label = stringResource(R.string.agents_filter_all, uiState.totalCount),
                        testTag = "agents_tab_all",
                    ),
                    HaroldSegmentOption(
                        value = AgentCategory.Enabled,
                        label = stringResource(R.string.agents_filter_enabled, uiState.enabledCount),
                        testTag = "agents_tab_enabled",
                    ),
                    HaroldSegmentOption(
                        value = AgentCategory.Popular,
                        label = stringResource(R.string.agents_filter_popular, uiState.popularCount),
                        testTag = "agents_tab_popular",
                    ),
                ),
                selected = uiState.selectedCategory,
                onSelect = onCategorySelected,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("agents_category_filter"),
            )

            if (uiState.loading) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("agents_loading")
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.defaultMinSize(minHeight = MIN_TOUCH_TARGET))
                    Text(
                        text = stringResource(R.string.agents_loading),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            uiState.error?.let { message ->
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("agents_error"),
                ) {
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }

            if (!uiState.loading && uiState.rows.isEmpty() && uiState.dismissedRows.isEmpty()) {
                Text(
                    text = stringResource(R.string.agents_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .testTag("agents_empty"),
                )
            } else if (!uiState.loading && displayedRows.isEmpty() && uiState.rows.isNotEmpty()) {
                HaroldCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    shape = RoundedCornerShape(16.dp),
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.SearchOff,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(36.dp),
                        )
                        Text(
                            text = if (uiState.searchQuery.isNotEmpty()) {
                                stringResource(R.string.agents_no_match, uiState.searchQuery)
                            } else when (uiState.selectedCategory) {
                                AgentCategory.Enabled -> stringResource(R.string.agents_none_enabled)
                                AgentCategory.Popular -> stringResource(R.string.agents_none_popular)
                                else -> stringResource(R.string.agents_empty)
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }

            if (uiState.showCreateCustom) {
                CustomAgentForm(
                    name = uiState.createName,
                    path = uiState.createPath,
                    args = uiState.createArgs,
                    binDir = uiState.createBinDir,
                    binDirVersion = uiState.createBinDirVersion,
                    onNameChanged = onCreateNameChanged,
                    onPathChanged = onCreatePathChanged,
                    onArgsChanged = onCreateArgsChanged,
                    onBinDirChanged = onCreateBinDirChanged,
                    onBinDirBrowse = onCreateBinDirBrowse,
                    onBinDirClear = onCreateBinDirClear,
                    onCreate = onCreateCustom,
                    onCancel = onCancelCreateCustom,
                )
            }

            displayedRows.forEach { row ->
                AgentCard(
                    row = row,
                    editing = uiState.editingAgentId == row.id,
                    uiState = uiState,
                    onRestart = onRestart,
                    onToggleEnabled = onToggleEnabled,
                    onEdit = onEdit,
                    onDelete = onDelete,
                    onEditDisplayNameChanged = onEditDisplayNameChanged,
                    onEditPathChanged = onEditPathChanged,
                    onEditArgsChanged = onEditArgsChanged,
                    onEditBinDirChanged = onEditBinDirChanged,
                    onEditBinDirBrowse = onEditBinDirBrowse,
                    onEditBinDirClear = onEditBinDirClear,
                    onEditEnabledChanged = onEditEnabledChanged,
                    onSaveEdit = onSaveEdit,
                    onCancelEdit = onCancelEdit,
                )
            }

            if (uiState.dismissedRows.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.agents_dismissed_section),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(top = 12.dp)
                        .testTag("agents_dismissed_section"),
                )
                uiState.dismissedRows.forEach { row ->
                    DismissedAgentCard(
                        row = row,
                        onRestore = onRestore,
                        onDelete = onDelete,
                    )
                }
            }

            Spacer(modifier = Modifier.height(88.dp))
        }
    }

    if (uiState.binDirPicker.open) {
        BinDirPickerDialog(
            state = uiState.binDirPicker,
            onDismiss = onBinDirCancel,
            onOpenFolder = onBinDirOpenFolder,
            onUp = onBinDirUp,
            onQueryChanged = onBinDirQueryChanged,
            onUseCurrent = onBinDirUseCurrent,
        )
    }
}

@Composable
private fun AgentCard(
    row: AgentRow,
    editing: Boolean,
    uiState: AgentsUiState,
    onRestart: (String) -> Unit,
    onToggleEnabled: (String, Boolean) -> Unit,
    onEdit: (String) -> Unit,
    onDelete: (String) -> Unit,
    onEditDisplayNameChanged: (String) -> Unit,
    onEditPathChanged: (String) -> Unit,
    onEditArgsChanged: (String) -> Unit,
    onEditBinDirChanged: (String) -> Unit,
    onEditBinDirBrowse: () -> Unit,
    onEditBinDirClear: () -> Unit,
    onEditEnabledChanged: (Boolean) -> Unit,
    onSaveEdit: () -> Unit,
    onCancelEdit: () -> Unit,
) {
    SwipeToDeleteListItem(
        rowTag = row.id,
        deleteLabel = stringResource(R.string.agents_delete),
        onDelete = { onDelete(row.id) },
        enabled = row.custom && !editing,
        shape = RoundedCornerShape(16.dp),
        deleteActionTag = "agent_delete_${row.id}",
    ) {
        HaroldCard(
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(
                1.dp,
                if (row.enabled) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                } else {
                    MaterialTheme.colorScheme.outlineVariant
                },
            ),
            containerColor = if (row.enabled) {
                MaterialTheme.colorScheme.surfaceContainerHigh
            } else {
                MaterialTheme.colorScheme.surfaceContainer
            },
            contentColor = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("agent_${row.id}"),
        ) {
            if (editing) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    HaroldTextField(
                        value = uiState.editDisplayName,
                        onValueChange = onEditDisplayNameChanged,
                        label = stringResource(R.string.agents_display_name_label),
                        modifier = Modifier.testTag("agent_edit_name"),
                    )
                    HaroldTextField(
                        value = uiState.editPath,
                        onValueChange = onEditPathChanged,
                        label = stringResource(R.string.agents_path_label),
                        placeholder = stringResource(R.string.agents_path_placeholder),
                        modifier = Modifier.testTag("agent_edit_path"),
                    )
                    HaroldTextField(
                        value = uiState.editArgs,
                        onValueChange = onEditArgsChanged,
                        label = stringResource(R.string.agents_args_label),
                        placeholder = stringResource(R.string.agents_args_placeholder),
                        modifier = Modifier.testTag("agent_edit_args"),
                    )
                    BinDirEditor(
                        value = uiState.editBinDir,
                        version = uiState.editBinDirVersion,
                        requiredNodeMajor = row.requiredNodeMajor,
                        onValueChanged = onEditBinDirChanged,
                        onBrowse = onEditBinDirBrowse,
                        onClear = onEditBinDirClear,
                        testTagPrefix = "agent_edit_bin_dir",
                    )
                    HaroldCheckboxRow(
                        checked = uiState.editEnabled,
                        onCheckedChange = onEditEnabledChanged,
                        label = stringResource(R.string.agents_enabled),
                        modifier = Modifier.testTag("agent_edit_enabled"),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        HaroldButton(
                            text = stringResource(R.string.connections_cancel),
                            onClick = onCancelEdit,
                            variant = HaroldButtonVariant.Secondary,
                            modifier = Modifier
                                .weight(1f)
                                .testTag("agent_edit_cancel"),
                        )
                        HaroldButton(
                            text = stringResource(R.string.agents_save),
                            onClick = onSaveEdit,
                            variant = HaroldButtonVariant.Primary,
                            modifier = Modifier
                                .weight(1f)
                                .testTag("agent_edit_save"),
                        )
                    }
                }
            } else {
                // Name, path, and runtime with the toggle, edit, and restart actions
                // kept on one compact line.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 14.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = row.displayName,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.testTag("agent_name_${row.id}"),
                            )
                            if (row.popular) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Filled.Star,
                                            contentDescription = null,
                                            modifier = Modifier.size(11.dp),
                                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                        )
                                        Text(
                                            text = stringResource(R.string.agents_popular_badge),
                                            style = MaterialTheme.typography.labelSmall,
                                            fontWeight = FontWeight.Medium,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        )
                                    }
                                }
                            }
                            if (row.custom) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.secondaryContainer,
                                ) {
                                    Text(
                                        text = stringResource(R.string.agents_custom_badge),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Medium,
                                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    )
                                }
                            }
                        }

                        // Enabled cards stay compact: keep the Node runtime
                        // summary, but hide the executable and bin paths.
                        if (!row.enabled) {
                            row.path?.let { path ->
                                Text(
                                    text = path,
                                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        row.binDir?.let { dir ->
                            Text(
                                text = row.binDirVersion?.let { version ->
                                    stringResource(R.string.agents_bin_dir_summary, version)
                                } ?: stringResource(R.string.agents_bin_dir_runtime_missing),
                                style = MaterialTheme.typography.labelSmall,
                                color = if (row.binDirVersion != null) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.error
                                },
                            )
                            if (!row.enabled) {
                                Text(
                                    text = dir,
                                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.testTag("agent_bin_dir_${row.id}"),
                                )
                            }
                        }
                    }

                    IconButton(
                        onClick = { onRestart(row.id) },
                        modifier = Modifier
                            .size(34.dp)
                            .testTag("agent_restart_${row.id}"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.agents_restart),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .size(20.dp)
                                .offset(x = 4.dp),
                        )
                    }
                    IconButton(
                        onClick = { onEdit(row.id) },
                        modifier = Modifier
                            .size(34.dp)
                            .testTag("agent_edit_${row.id}"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Edit,
                            contentDescription = stringResource(R.string.agents_edit),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .size(20.dp)
                                .offset(x = (-2).dp),
                        )
                    }
                    Spacer(modifier = Modifier.width(3.dp))
                    Box(
                        modifier = Modifier
                            .width(42.dp)
                            .height(MIN_TOUCH_TARGET),
                        contentAlignment = Alignment.Center,
                    ) {
                        Switch(
                            checked = row.enabled,
                            onCheckedChange = { onToggleEnabled(row.id, it) },
                            modifier = Modifier
                                .scale(0.8f)
                                .testTag("agent_enabled_${row.id}"),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DismissedAgentCard(
    row: AgentRow,
    onRestore: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    SwipeToDeleteListItem(
        rowTag = row.id,
        deleteLabel = stringResource(R.string.agents_delete),
        onDelete = { onDelete(row.id) },
        enabled = row.custom,
        shape = RoundedCornerShape(14.dp),
        deleteActionTag = "agent_dismissed_delete_${row.id}",
    ) {
        HaroldCard(
            shape = RoundedCornerShape(14.dp),
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("agent_dismissed_${row.id}"),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = row.displayName,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    onClick = { onRestore(row.id) },
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("agent_restore_${row.id}"),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Restore,
                        contentDescription = stringResource(R.string.agents_restore),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CustomAgentForm(
    name: String,
    path: String,
    args: String,
    binDir: String,
    binDirVersion: String?,
    onNameChanged: (String) -> Unit,
    onPathChanged: (String) -> Unit,
    onArgsChanged: (String) -> Unit,
    onBinDirChanged: (String) -> Unit,
    onBinDirBrowse: () -> Unit,
    onBinDirClear: () -> Unit,
    onCreate: () -> Unit,
    onCancel: () -> Unit,
) {
    HaroldFormSection(
        title = stringResource(R.string.agents_custom_title),
        subtitle = stringResource(R.string.agents_custom_subtitle),
        modifier = Modifier.testTag("agents_custom_form"),
    ) {
        HaroldTextField(
            value = name,
            onValueChange = onNameChanged,
            label = stringResource(R.string.agents_display_name_label),
            modifier = Modifier.testTag("agent_create_name"),
        )
        HaroldTextField(
            value = path,
            onValueChange = onPathChanged,
            label = stringResource(R.string.agents_path_label),
            placeholder = stringResource(R.string.agents_path_placeholder),
            modifier = Modifier.testTag("agent_create_path"),
        )
        HaroldTextField(
            value = args,
            onValueChange = onArgsChanged,
            label = stringResource(R.string.agents_args_label),
            placeholder = stringResource(R.string.agents_args_placeholder),
            modifier = Modifier.testTag("agent_create_args"),
        )
        BinDirEditor(
            value = binDir,
            version = binDirVersion,
            requiredNodeMajor = null,
            onValueChanged = onBinDirChanged,
            onBrowse = onBinDirBrowse,
            onClear = onBinDirClear,
            testTagPrefix = "agent_create_bin_dir",
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            HaroldButton(
                text = stringResource(R.string.connections_cancel),
                onClick = onCancel,
                variant = HaroldButtonVariant.Secondary,
                modifier = Modifier
                    .weight(1f)
                    .testTag("agent_create_cancel"),
            )
            HaroldButton(
                text = stringResource(R.string.agents_custom_create),
                onClick = onCreate,
                variant = HaroldButtonVariant.Primary,
                modifier = Modifier
                    .weight(1f)
                    .testTag("agent_create_submit"),
            )
        }
    }
}

@Composable
private fun BinDirEditor(
    value: String,
    version: String?,
    requiredNodeMajor: Int?,
    onValueChanged: (String) -> Unit,
    onBrowse: () -> Unit,
    onClear: () -> Unit,
    testTagPrefix: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        HaroldTextField(
            value = value,
            onValueChange = onValueChanged,
            label = stringResource(R.string.agents_bin_dir_label),
            placeholder = stringResource(R.string.agents_bin_dir_placeholder),
            modifier = Modifier.testTag(testTagPrefix),
        )
        Text(
            text = stringResource(R.string.agents_bin_dir_help),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (version != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = stringResource(R.string.agents_bin_dir_version, version),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.testTag("${testTagPrefix}_version"),
                )
                val major = version.removePrefix("v").substringBefore('.').toIntOrNull()
                if (major != null && requiredNodeMajor != null && major < requiredNodeMajor) {
                    Text(
                        text = stringResource(R.string.agents_bin_dir_too_old, requiredNodeMajor),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End,
        ) {
            HaroldButton(
                text = stringResource(R.string.agents_bin_dir_browse),
                onClick = onBrowse,
                variant = HaroldButtonVariant.Secondary,
                size = HaroldButtonSize.Small,
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.FolderOpen,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                },
                modifier = Modifier.testTag("${testTagPrefix}_browse"),
            )
            if (value.isNotBlank()) {
                HaroldButton(
                    text = stringResource(R.string.agents_bin_dir_clear),
                    onClick = onClear,
                    variant = HaroldButtonVariant.Secondary,
                    size = HaroldButtonSize.Small,
                    modifier = Modifier.testTag("${testTagPrefix}_clear"),
                )
            }
        }
    }
}

@Composable
private fun BinDirPickerDialog(
    state: BinDirPickerUiState,
    onDismiss: () -> Unit,
    onOpenFolder: (String) -> Unit,
    onUp: () -> Unit,
    onQueryChanged: (String) -> Unit,
    onUseCurrent: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = stringResource(R.string.agents_bin_dir_picker_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.testTag("agent_bin_dir_picker_close"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.agents_bin_dir_picker_close),
                        )
                    }
                }
                RemoteFolderBrowser(
                    path = state.path,
                    parent = state.parent,
                    folders = state.folders,
                    loading = state.loading,
                    error = state.error,
                    enabled = true,
                    query = state.query,
                    selectedPath = null,
                    testTagPrefix = "agent_bin_dir",
                    showNewFolder = false,
                    onOpenFolder = onOpenFolder,
                    onUp = onUp,
                    onQueryChanged = onQueryChanged,
                    onUseCurrent = onUseCurrent,
                )
            }
        }
    }
}
