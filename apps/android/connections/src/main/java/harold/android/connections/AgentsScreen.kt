package harold.android.connections

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
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
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.contracts.AgentAuthStatus
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldCard
import harold.android.ui.components.HaroldCheckboxRow
import harold.android.ui.components.HaroldFormSection
import harold.android.ui.components.HaroldSegmentOption
import harold.android.ui.components.HaroldSegmentedControl
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
    onSearchQueryChanged: (String) -> Unit = {},
    onCategorySelected: (AgentCategory) -> Unit = {},
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
                    onNameChanged = onCreateNameChanged,
                    onPathChanged = onCreatePathChanged,
                    onArgsChanged = onCreateArgsChanged,
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
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Header: Title & Badges on Left, Switch on Right
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
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

                        // Path (if present)
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

                    Box(
                        modifier = Modifier.padding(start = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Switch(
                            checked = row.enabled,
                            onCheckedChange = { onToggleEnabled(row.id, it) },
                            modifier = Modifier
                                .defaultMinSize(minWidth = MIN_TOUCH_TARGET, minHeight = MIN_TOUCH_TARGET)
                                .testTag("agent_enabled_${row.id}"),
                        )
                    }
                }

                // Status Chips Row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("agent_status_${row.id}"),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StatusPill(
                        label = if (row.present) {
                            stringResource(R.string.agents_present)
                        } else {
                            stringResource(R.string.agents_not_present)
                        },
                        isPositive = row.present,
                    )
                    StatusPill(
                        label = if (row.enabled) {
                            stringResource(R.string.agents_enabled)
                        } else {
                            stringResource(R.string.agents_disabled)
                        },
                        isPositive = row.enabled,
                    )
                    AuthStatusPill(status = row.authStatus)
                }

                // Divider before action row
                HorizontalDivider(
                    modifier = Modifier.padding(top = 2.dp),
                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                )

                // Bottom Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End,
                ) {
                    IconButton(
                        onClick = { onRestart(row.id) },
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("agent_restart_${row.id}"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.agents_restart),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
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
                            modifier = Modifier.size(20.dp),
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
                            tint = MaterialTheme.colorScheme.error.copy(alpha = 0.8f),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusPill(
    label: String,
    isPositive: Boolean,
    modifier: Modifier = Modifier,
) {
    val containerColor = if (isPositive) {
        MaterialTheme.colorScheme.surfaceContainerHighest
    } else {
        MaterialTheme.colorScheme.surfaceContainerLow
    }
    val contentColor = if (isPositive) {
        MaterialTheme.colorScheme.onSurface
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
    }
    val dotColor = if (isPositive) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.outline
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = containerColor,
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(5.dp)
                    .background(dotColor, CircleShape),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = contentColor,
            )
        }
    }
}

@Composable
private fun AuthStatusPill(
    status: AgentAuthStatus,
    modifier: Modifier = Modifier,
) {
    val (containerColor, contentColor) = when (status) {
        AgentAuthStatus.Authenticated -> Pair(
            MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f),
            MaterialTheme.colorScheme.onPrimaryContainer,
        )
        AgentAuthStatus.NeedsAuth -> Pair(
            MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.6f),
            MaterialTheme.colorScheme.onTertiaryContainer,
        )
        AgentAuthStatus.Error -> Pair(
            MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.6f),
            MaterialTheme.colorScheme.onErrorContainer,
        )
        AgentAuthStatus.Unknown -> Pair(
            MaterialTheme.colorScheme.surfaceContainerHighest,
            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
        )
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = containerColor,
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = authLabel(status),
                style = MaterialTheme.typography.labelSmall,
                color = contentColor,
            )
        }
    }
}

@Composable
private fun DismissedAgentCard(
    row: AgentRow,
    onRestore: (String) -> Unit,
    onDelete: (String) -> Unit,
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
private fun authLabel(status: AgentAuthStatus): String = when (status) {
    AgentAuthStatus.Authenticated -> stringResource(R.string.agents_auth_authenticated)
    AgentAuthStatus.NeedsAuth -> stringResource(R.string.agents_auth_needs_auth)
    AgentAuthStatus.Error -> stringResource(R.string.agents_auth_error)
    AgentAuthStatus.Unknown -> stringResource(R.string.agents_auth_unknown)
}
