package harold.android.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.debug.probeTag

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateSessionScreen(
    createState: CreateSessionUiState,
    onBack: () -> Unit,
    onWorkspaceChanged: (String) -> Unit,
    onAgentChanged: (harold.android.contracts.AgentId) -> Unit,
    onSubmit: () -> Unit,
    onNewWorkspaceClick: () -> Unit = {},
    onRecentSessionFoldersToggle: () -> Unit = {},
    onRecentSessionFoldersRetry: () -> Unit = {},
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.chat_new_session)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .probeTag("create_session_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Go back from new session",
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
                .probeTag("create_session_screen"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            WorkspaceDropdown(
                workspaces = createState.workspaces,
                recentSessionFolders = createState.recentSessionFolders,
                recentSessionFoldersExpanded = createState.recentSessionFoldersExpanded,
                recentSessionFoldersLoading = createState.recentSessionFoldersLoading,
                recentSessionFoldersError = createState.recentSessionFoldersError,
                selectedWorkspaceId = createState.selectedWorkspaceId,
                onWorkspaceChanged = onWorkspaceChanged,
                onRecentSessionFoldersToggle = onRecentSessionFoldersToggle,
                onRecentSessionFoldersRetry = onRecentSessionFoldersRetry,
                onNewWorkspaceClick = onNewWorkspaceClick,
            )

            val notice = when (createState.notice) {
                CreateSessionNotice.RememberedWorkspaceMissing ->
                    stringResource(R.string.create_session_remembered_workspace_missing)
                CreateSessionNotice.PreferredWorkspaceMissing ->
                    stringResource(R.string.create_session_preferred_workspace_missing)
                null -> null
            }
            if (notice != null) {
                Text(
                    text = notice,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.probeTag("create_session_notice"),
                )
            }

            AgentDropdown(
                agents = createState.agents,
                selectedAgentId = createState.selectedAgentId,
                onAgentChanged = onAgentChanged,
            )

            if (createState.error != null) {
                Text(
                    text = createState.error,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.probeTag("create_session_error"),
                )
            }

            HaroldButton(
                text = if (createState.submitting) {
                    stringResource(R.string.create_session_starting)
                } else {
                    stringResource(R.string.create_session_start)
                },
                onClick = onSubmit,
                enabled = !createState.submitting,
                variant = HaroldButtonVariant.Primary,
                modifier = Modifier
                    .fillMaxWidth()
                    .probeTag("create_session_submit"),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkspaceDropdown(
    workspaces: List<WorkspaceRow>,
    recentSessionFolders: List<WorkspaceRow>,
    recentSessionFoldersExpanded: Boolean,
    recentSessionFoldersLoading: Boolean,
    recentSessionFoldersError: String?,
    selectedWorkspaceId: String,
    onWorkspaceChanged: (String) -> Unit,
    onRecentSessionFoldersToggle: () -> Unit,
    onRecentSessionFoldersRetry: () -> Unit,
    onNewWorkspaceClick: () -> Unit = {},
) {
    var expanded by remember { mutableStateOf(false) }
    val labeled = remember(workspaces, recentSessionFolders) {
        // Saved workspaces and hints share the label space so a saved
        // `harold` and a session-folder `harold` stay distinguishable.
        disambiguateWorkspaceLabels(workspaces + recentSessionFolders)
    }
    val labeledWorkspaces = labeled.filter { workspace -> workspace.source == WorkspaceSource.Saved }
    val labeledRecentFolders = labeled.filter { workspace ->
        workspace.source == WorkspaceSource.SessionFolder
    }
    val selectedWorkspace = labeledWorkspaces.firstOrNull { workspace -> workspace.id == selectedWorkspaceId }
        ?: labeledRecentFolders.firstOrNull { workspace -> workspace.id == selectedWorkspaceId }
    val selectedLabel = selectedWorkspace?.pickerLabel() ?: "Choose workspace"
    val showSelectedBadge = selectedWorkspace != null &&
        (
            selectedWorkspace.connectionColorId.isNotEmpty() ||
                selectedWorkspace.connectionIconId.isNotEmpty() ||
                selectedWorkspace.connectionName.isNotEmpty()
            )

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text(text = "Workspace") },
            leadingIcon = if (showSelectedBadge) {
                {
                    HaroldBadge(
                        colorId = selectedWorkspace.connectionColorId,
                        iconId = selectedWorkspace.connectionIconId,
                        size = 22.dp,
                        modifier = Modifier.probeTag("create_session_workspace_badge"),
                    )
                }
            } else {
                null
            },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth()
                .probeTag("create_session_workspace"),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                },
                text = {
                    Text(
                        text = stringResource(R.string.create_session_new_workspace),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                },
                onClick = {
                    expanded = false
                    onNewWorkspaceClick()
                },
                modifier = Modifier.probeTag("create_session_new_workspace"),
            )

            HorizontalDivider(
                modifier = Modifier.padding(vertical = 4.dp),
                color = MaterialTheme.colorScheme.outlineVariant,
            )

            labeledWorkspaces.forEach { workspace ->
                WorkspaceOption(
                    workspace = workspace,
                    selected = workspace.id == selectedWorkspaceId,
                    onClick = {
                        onWorkspaceChanged(workspace.id)
                        expanded = false
                    },
                )
            }

            DropdownMenuItem(
                text = {
                    Column {
                        Text(
                            text = stringResource(R.string.create_session_recent_folders),
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            text = stringResource(R.string.create_session_recent_folders_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                onClick = onRecentSessionFoldersToggle,
                modifier = Modifier.probeTag("create_session_recent_folders"),
            )

            if (recentSessionFoldersExpanded) {
                when {
                    recentSessionFoldersLoading -> {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    text = stringResource(R.string.create_session_recent_folders_loading),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            onClick = {},
                            enabled = false,
                            modifier = Modifier.probeTag("create_session_recent_folders_loading"),
                        )
                    }

                    recentSessionFoldersError != null -> {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    text = stringResource(R.string.create_session_recent_folders_failed),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            },
                            onClick = onRecentSessionFoldersRetry,
                            modifier = Modifier.probeTag("create_session_recent_folders_retry"),
                        )
                    }

                    labeledRecentFolders.isEmpty() -> {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    text = stringResource(R.string.create_session_recent_folders_empty),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            onClick = {},
                            enabled = false,
                            modifier = Modifier.probeTag("create_session_recent_folders_empty"),
                        )
                    }

                    else -> {
                        labeledRecentFolders.forEach { workspace ->
                            WorkspaceOption(
                                workspace = workspace,
                                selected = workspace.id == selectedWorkspaceId,
                                onClick = {
                                    onWorkspaceChanged(workspace.id)
                                    expanded = false
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceOption(
    workspace: WorkspaceRow,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val hasBadge = workspace.connectionColorId.isNotEmpty() ||
        workspace.connectionIconId.isNotEmpty() ||
        workspace.connectionName.isNotEmpty()
    DropdownMenuItem(
        leadingIcon = if (hasBadge) {
            {
                HaroldBadge(
                    colorId = workspace.connectionColorId,
                    iconId = workspace.connectionIconId,
                    size = 22.dp,
                    modifier = Modifier.testTag("create_session_workspace_option_badge_${workspace.id}"),
                )
            }
        } else {
            null
        },
        text = {
            Column {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = workspace.pickerLabel(),
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (workspace.source == WorkspaceSource.SessionFolder) {
                        Text(
                            text = stringResource(R.string.create_session_session_folder_badge),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            maxLines = 1,
                            modifier = Modifier
                                .background(
                                    color = MaterialTheme.colorScheme.secondaryContainer,
                                    shape = RoundedCornerShape(4.dp),
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                .testTag("create_session_session_folder_badge_${workspace.id}"),
                        )
                    }
                }
                if (workspace.path.isNotBlank()) {
                    Text(
                        text = workspace.path,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        },
        trailingIcon = if (selected) {
            {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        } else {
            null
        },
        onClick = onClick,
        modifier = Modifier.probeTag(createSessionWorkspaceOptionTag(workspace.id)),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AgentDropdown(
    agents: List<AgentOption>,
    selectedAgentId: harold.android.contracts.AgentId?,
    onAgentChanged: (harold.android.contracts.AgentId) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = agents.firstOrNull { agent -> agent.id == selectedAgentId }?.displayName
        ?: "Choose agent"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text(text = "Agent") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth()
                .probeTag("create_session_agent"),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            agents.forEach { agent ->
                DropdownMenuItem(
                    text = { Text(text = agent.displayName) },
                    onClick = {
                        onAgentChanged(agent.id)
                        expanded = false
                    },
                    modifier = Modifier.probeTag(createSessionAgentOptionTag(agent.id)),
                )
            }
        }
    }
}
