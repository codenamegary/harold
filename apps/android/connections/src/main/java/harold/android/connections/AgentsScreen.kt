package harold.android.connections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.contracts.AgentAuthStatus
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldCheckboxRow
import harold.android.ui.components.HaroldFormSection
import harold.android.ui.components.HaroldTextField

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
) {
    val addCustomContentDescription = stringResource(R.string.agents_custom_add)

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
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
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
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
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
            }

            if (uiState.showCreateCustom) {
                CustomAgentForm(
                    name = uiState.createName,
                    path = uiState.createPath,
                    args = uiState.createArgs,
                    onNameChanged = onCreateNameChanged,
                    onPathChanged = onCreatePathChanged,
                    onArgsChanged = onCreateArgsChanged,
                    onCreate = onCreateCustom,
                    onCancel = onCancelCreateCustom,
                )
            }

            uiState.rows.forEach { row ->
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
                    onEditEnabledChanged = onEditEnabledChanged,
                    onSaveEdit = onSaveEdit,
                    onCancelEdit = onCancelEdit,
                )
            }

            if (uiState.dismissedRows.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.agents_dismissed_section),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(top = 8.dp)
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

            Spacer(modifier = Modifier.height(8.dp))
        }
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
    onEditEnabledChanged: (Boolean) -> Unit,
    onSaveEdit: () -> Unit,
    onCancelEdit: () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
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
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = row.displayName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.testTag("agent_name_${row.id}"),
                        )
                        row.path?.let { path ->
                            Text(
                                text = path,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    IconButton(
                        onClick = { onRestart(row.id) },
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("agent_restart_${row.id}"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Restore,
                            contentDescription = stringResource(R.string.agents_restart),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(
                        onClick = { onEdit(row.id) },
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("agent_edit_${row.id}"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Edit,
                            contentDescription = stringResource(R.string.agents_edit),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(
                        onClick = { onDelete(row.id) },
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("agent_delete_${row.id}"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Delete,
                            contentDescription = stringResource(R.string.agents_delete),
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
                Row(
                    modifier = Modifier.testTag("agent_status_${row.id}"),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    StatusChip(
                        text = if (row.present) {
                            stringResource(R.string.agents_present)
                        } else {
                            stringResource(R.string.agents_not_present)
                        },
                        highlighted = row.present,
                    )
                    StatusChip(
                        text = if (row.enabled) {
                            stringResource(R.string.agents_enabled)
                        } else {
                            stringResource(R.string.agents_disabled)
                        },
                        highlighted = row.enabled,
                    )
                    StatusChip(
                        text = authLabel(row.authStatus),
                        highlighted = row.authStatus == AgentAuthStatus.Authenticated,
                    )
                }
                HaroldCheckboxRow(
                    checked = row.enabled,
                    onCheckedChange = { checked -> onToggleEnabled(row.id, checked) },
                    label = stringResource(R.string.agents_enabled),
                    modifier = Modifier.testTag("agent_enabled_${row.id}"),
                )
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
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
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
            IconButton(
                onClick = { onDelete(row.id) },
                modifier = Modifier
                    .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                    .testTag("agent_dismissed_delete_${row.id}"),
            ) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.agents_delete),
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun CustomAgentForm(
    name: String,
    path: String,
    args: String,
    onNameChanged: (String) -> Unit,
    onPathChanged: (String) -> Unit,
    onArgsChanged: (String) -> Unit,
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
private fun StatusChip(
    text: String,
    highlighted: Boolean,
) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = if (highlighted) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
    )
}

@Composable
private fun authLabel(status: AgentAuthStatus): String = when (status) {
    AgentAuthStatus.Authenticated -> stringResource(R.string.agents_auth_authenticated)
    AgentAuthStatus.NeedsAuth -> stringResource(R.string.agents_auth_needs_auth)
    AgentAuthStatus.Error -> stringResource(R.string.agents_auth_error)
    AgentAuthStatus.Unknown -> stringResource(R.string.agents_auth_unknown)
}
