package harold.android.connections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import harold.android.contracts.AgentLogs
import harold.android.contracts.LogRun
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldDropdownField
import harold.android.ui.components.HaroldDropdownOption
import harold.android.ui.components.HaroldFormScreen
import harold.android.ui.components.HaroldFormSection
import harold.android.ui.components.HaroldTextField

private val EDIT_FORM_TAGS = SshFormTags(
    back = "settings_back",
    name = "settings_name",
    host = "settings_endpoint",
    user = "settings_user",
    port = "settings_port",
    fingerprint = "settings_fingerprint",
    authDropdown = "settings_credential_picker",
    authSummary = "settings_auth_summary",
    colorPrefix = "settings_color_",
    iconPrefix = "settings_icon_",
    save = "settings_save",
    error = "settings_error",
    savedCredentialPrefix = "settings_credential_",
    keepCurrentOption = "settings_credential_keep",
    connectionSection = "settings_host_section",
    authSection = "settings_credential_section",
    appearanceSection = "settings_appearance_section",
)

@Composable
fun ConnectionSettingsScreen(
    uiState: ConnectionSettingsUiState,
    onBack: () -> Unit,
    onNameChanged: (String) -> Unit,
    onColorSelected: (String) -> Unit,
    onIconSelected: (String) -> Unit,
    onDefaultAgentSelected: (String?) -> Unit,
    onDefaultWorkspaceChanged: (String) -> Unit,
    onCredentialSelected: (String?) -> Unit,
    onSave: () -> Unit,
    onShowForgetConfirm: () -> Unit,
    onHideForgetConfirm: () -> Unit,
    onForget: () -> Unit,
    onShowLogsCleanup: () -> Unit,
    onHideLogsCleanup: () -> Unit,
    onCleanupLogs: () -> Unit,
    onReloadLogs: () -> Unit,
) {
    val snackbar = remember { SnackbarHostState() }
    val savedMessage = stringResource(R.string.settings_saved)
    LaunchedEffect(uiState.saved) {
        if (uiState.saved) {
            snackbar.showSnackbar(savedMessage)
        }
    }

    if (!uiState.loaded) {
        HaroldFormScreen(
            title = stringResource(R.string.settings_title),
            onBack = onBack,
            backContentDescription = stringResource(R.string.settings_back),
            backTestTag = "settings_back",
        ) {
            Spacer(modifier = Modifier.height(24.dp))
        }
        return
    }

    SshConnectionFormScreen(
        state = SshConnectionFormState(
            mode = SshConnectionFormMode.Edit,
            name = uiState.name,
            host = uiState.host,
            port = uiState.port,
            user = uiState.user,
            authMode = SshAuthMode.GeneratedKey,
            savedCredentials = uiState.credentials.map { credential ->
                SavedSshCredential(
                    id = credential.id,
                    name = credential.name,
                    kind = credential.kind,
                    publicKey = credential.publicKey,
                )
            },
            selectedCredentialId = uiState.selectedCredentialId,
            colorId = uiState.colorId,
            iconId = uiState.iconId,
            canSave = true,
            errorMessage = uiState.error,
            endpointPreview = uiState.endpoint,
            savedFingerprint = uiState.fingerprint,
            currentAuthSummary = uiState.authSummary,
        ),
        actions = SshConnectionFormActions(
            onBack = onBack,
            onNameChanged = onNameChanged,
            onColorSelected = onColorSelected,
            onIconSelected = onIconSelected,
            onCredentialSelected = onCredentialSelected,
            onSave = onSave,
        ),
        tags = EDIT_FORM_TAGS,
        snackbarHost = { SnackbarHost(snackbar) },
        editExtras = {
            HaroldFormSection(
                title = stringResource(R.string.settings_defaults_section),
                modifier = Modifier.testTag("settings_defaults_section"),
            ) {
                HaroldDropdownField(
                    label = stringResource(R.string.settings_default_agent_label),
                    options = listOf(
                        HaroldDropdownOption(
                            value = "",
                            label = stringResource(R.string.settings_default_agent_none),
                            testTag = "settings_default_agent_none",
                        ),
                    ) + uiState.defaultAgentOptions.map { option ->
                        HaroldDropdownOption(
                            value = option.id,
                            label = option.displayName,
                            testTag = "settings_default_agent_${option.id}",
                        )
                    },
                    selectedValue = uiState.defaultAgentId ?: "",
                    onOptionSelected = { selected ->
                        onDefaultAgentSelected(selected.ifBlank { null })
                    },
                    anchorTestTag = "settings_default_agent",
                )
                HaroldTextField(
                    value = uiState.defaultWorkspacePath,
                    onValueChange = onDefaultWorkspaceChanged,
                    label = stringResource(R.string.settings_default_workspace_label),
                    placeholder = stringResource(R.string.settings_default_workspace_placeholder),
                    modifier = Modifier.testTag("settings_default_workspace"),
                )
            }

            AgentLogsSection(
                state = uiState.agentLogs,
                onShowLogsCleanup = onShowLogsCleanup,
                onReloadLogs = onReloadLogs,
            )

            HaroldFormSection(
                title = stringResource(R.string.settings_danger_section),
                modifier = Modifier.testTag("settings_danger_section"),
            ) {
                HaroldButton(
                    text = stringResource(R.string.settings_forget),
                    onClick = onShowForgetConfirm,
                    variant = HaroldButtonVariant.Destructive,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_forget"),
                )
            }
        },
    )

    if (uiState.forgetConfirmVisible) {
        AlertDialog(
            onDismissRequest = onHideForgetConfirm,
            title = { Text(text = stringResource(R.string.settings_forget_confirm_title)) },
            text = { Text(text = stringResource(R.string.settings_forget_confirm_body)) },
            confirmButton = {
                TextButton(
                    onClick = onForget,
                    modifier = Modifier.testTag("settings_forget_confirm"),
                ) {
                    Text(text = stringResource(R.string.settings_forget_confirm))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = onHideForgetConfirm,
                    modifier = Modifier.testTag("settings_forget_cancel"),
                ) {
                    Text(text = stringResource(R.string.connections_cancel))
                }
            },
            modifier = Modifier.testTag("settings_forget_dialog"),
        )
    }

    if (uiState.agentLogs.cleanupConfirmVisible) {
        val preview = hostLogCleanupPreview(uiState.agentLogs.logs)
        AlertDialog(
            onDismissRequest = onHideLogsCleanup,
            title = { Text(text = stringResource(R.string.settings_agent_logs_cleanup_title)) },
            text = {
                Text(
                    text = pluralStringResource(
                        R.plurals.settings_agent_logs_cleanup_body,
                        preview.runs,
                        preview.runs,
                        formatLogBytes(preview.bytes),
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = onCleanupLogs,
                    enabled = !uiState.agentLogs.cleanupRunning,
                    modifier = Modifier.testTag("settings_agent_logs_cleanup_confirm"),
                ) {
                    Text(
                        text = if (uiState.agentLogs.cleanupRunning) {
                            stringResource(R.string.settings_agent_logs_cleanup_running)
                        } else {
                            stringResource(R.string.settings_agent_logs_cleanup_confirm)
                        },
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = onHideLogsCleanup,
                    modifier = Modifier.testTag("settings_agent_logs_cleanup_cancel"),
                ) {
                    Text(text = stringResource(R.string.connections_cancel))
                }
            },
            modifier = Modifier.testTag("settings_agent_logs_cleanup_dialog"),
        )
    }
}

@Composable
private fun AgentLogsSection(
    state: AgentLogsUiState,
    onShowLogsCleanup: () -> Unit,
    onReloadLogs: () -> Unit,
) {
    HaroldFormSection(
        title = stringResource(R.string.settings_agent_logs_section),
        modifier = Modifier.testTag("settings_agent_logs_section"),
    ) {
        state.error?.let { error ->
            Text(
                text = stringResource(R.string.settings_agent_logs_error, error),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("settings_agent_logs_error"),
            )
        }
        if (state.error != null && !state.loading) {
            HaroldButton(
                text = stringResource(R.string.settings_agent_logs_retry),
                onClick = onReloadLogs,
                variant = HaroldButtonVariant.Secondary,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings_agent_logs_retry"),
            )
        }

        val logs = state.logs
        if (logs == null) {
            if (state.loading) {
                Text(
                    text = stringResource(R.string.settings_agent_logs_loading),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.testTag("settings_agent_logs_loading"),
                )
            } else if (state.error == null) {
                Text(
                    text = stringResource(R.string.settings_agent_logs_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("settings_agent_logs_empty"),
                )
            }
            return@HaroldFormSection
        }

        Text(
            text = stringResource(
                R.string.settings_agent_logs_total,
                formatLogBytes(logs.totalBytes),
            ),
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            modifier = Modifier.testTag("settings_agent_logs_total"),
        )

        if (hostLogsWarning(logs.totalBytes)) {
            Text(
                text = stringResource(R.string.settings_agent_logs_warning),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("settings_agent_logs_warning"),
            )
            HaroldButton(
                text = stringResource(R.string.settings_agent_logs_cleanup),
                onClick = onShowLogsCleanup,
                variant = HaroldButtonVariant.Secondary,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings_agent_logs_cleanup"),
            )
        }

        state.cleanupResult?.let { result ->
            Text(
                text = pluralStringResource(
                    R.plurals.settings_agent_logs_cleanup_result,
                    result.deletedRuns,
                    result.deletedRuns,
                    formatLogBytes(result.removedBytes),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.testTag("settings_agent_logs_cleanup_result"),
            )
        }

        if (logs.agents.isEmpty()) {
            Text(
                text = stringResource(R.string.settings_agent_logs_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.testTag("settings_agent_logs_empty"),
            )
        } else {
            sortedAgentLogs(logs).forEachIndexed { index, agent ->
                if (index > 0) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
                AgentLogsBlock(agent = agent)
            }
        }
    }
}

@Composable
private fun AgentLogsBlock(agent: AgentLogs) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("settings_agent_logs_agent_${agent.agentId}"),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = agent.displayName ?: agent.agentId,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.weight(1f),
            )
            Text(
                text = formatLogBytes(agent.totalBytes),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        sortedLogRuns(agent).forEach { run ->
            LogRunRow(agentId = agent.agentId, run = run, hostRunning = agent.hostRunning)
        }
    }
}

@Composable
private fun LogRunRow(agentId: String, run: LogRun, hostRunning: Boolean) {
    val label = when (logRunRole(run, hostRunning)) {
        LogRunRole.Current -> stringResource(R.string.settings_agent_logs_run_current)
        LogRunRole.Latest -> stringResource(R.string.settings_agent_logs_run_latest)
        LogRunRole.Past -> formatRunStartedAt(run.startedAt)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("settings_agent_logs_run_${agentId}_${run.id}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = formatLogBytes(run.bytes),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
