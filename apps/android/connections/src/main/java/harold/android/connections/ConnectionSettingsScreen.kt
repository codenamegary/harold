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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import harold.android.ui.components.HaroldAppearanceEditor
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldDropdownOption
import harold.android.ui.components.HaroldExposedDropdown
import harold.android.ui.components.HaroldFormSection
import harold.android.credentials.SshCredentialKind
import harold.android.ui.components.HaroldTextField

private val MIN_TOUCH_TARGET = 48.dp

/** Sentinel for "keep the current sign-in" in the credential dropdown. */
private const val KEEP_CURRENT = ""


@OptIn(ExperimentalMaterial3Api::class)
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
) {
    val snackbar = remember { SnackbarHostState() }
    val savedMessage = stringResource(R.string.settings_saved)
    LaunchedEffect(uiState.saved) {
        if (uiState.saved) {
            snackbar.showSnackbar(savedMessage)
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("settings_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.settings_back),
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
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            uiState.error?.let { message ->
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings_error"),
                ) {
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }

            if (!uiState.loaded) {
                Spacer(modifier = Modifier.height(24.dp))
                return@Column
            }

            HaroldFormSection(
                title = stringResource(R.string.settings_host_section),
                modifier = Modifier.testTag("settings_host_section"),
            ) {
                Text(
                    text = uiState.endpoint,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.testTag("settings_endpoint"),
                )
                HaroldTextField(
                    value = uiState.fingerprint,
                    onValueChange = { },
                    label = stringResource(R.string.settings_fingerprint_label),
                    enabled = false,
                    modifier = Modifier.testTag("settings_fingerprint"),
                )
                Text(
                    text = uiState.authSummary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("settings_auth_summary"),
                )
            }

            HaroldFormSection(
                title = stringResource(R.string.settings_credential_section),
                modifier = Modifier.testTag("settings_credential_section"),
            ) {
                Text(
                    text = stringResource(R.string.settings_credential_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                HaroldExposedDropdown(
                    options = listOf(
                        HaroldDropdownOption(
                            value = KEEP_CURRENT,
                            label = stringResource(R.string.settings_credential_keep),
                            testTag = "settings_credential_keep",
                        ),
                    ) + uiState.credentials.map { credential ->
                        HaroldDropdownOption(
                            value = credential.id,
                            label = credential.name,
                            subtitle = if (credential.kind == SshCredentialKind.Password) {
                                stringResource(R.string.settings_credential_stored_password)
                            } else {
                                stringResource(R.string.settings_credential_stored_key)
                            },
                            testTag = "settings_credential_${credential.id}",
                        )
                    },
                    selectedValue = uiState.selectedCredentialId ?: KEEP_CURRENT,
                    onOptionSelected = { selected ->
                        onCredentialSelected(selected.takeUnless { it == KEEP_CURRENT })
                    },
                    label = stringResource(R.string.settings_credential_pick),
                    modifier = Modifier.testTag("settings_credential_picker"),
                )
            }

            HaroldFormSection(
                title = stringResource(R.string.settings_defaults_section),
                modifier = Modifier.testTag("settings_defaults_section"),
            ) {
                HaroldExposedDropdown(
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
                    label = stringResource(R.string.settings_default_agent_label),
                    modifier = Modifier.testTag("settings_default_agent"),
                )
                HaroldTextField(
                    value = uiState.defaultWorkspacePath,
                    onValueChange = onDefaultWorkspaceChanged,
                    label = stringResource(R.string.settings_default_workspace_label),
                    placeholder = stringResource(R.string.settings_default_workspace_placeholder),
                    modifier = Modifier.testTag("settings_default_workspace"),
                )
            }

            HaroldFormSection(
                title = stringResource(R.string.settings_appearance_section),
                modifier = Modifier.testTag("settings_appearance_section"),
            ) {
                HaroldAppearanceEditor(
                    name = uiState.name,
                    colorId = uiState.colorId,
                    iconId = uiState.iconId,
                    onNameChanged = onNameChanged,
                    onColorSelected = onColorSelected,
                    onIconSelected = onIconSelected,
                    nameLabel = stringResource(R.string.connections_name_label),
                    colorLabel = stringResource(R.string.connections_color_label),
                    iconLabel = stringResource(R.string.connections_icon_label),
                    nameFieldTag = "settings_name",
                    colorTagPrefix = "settings_color_",
                    iconTagPrefix = "settings_icon_",
                    endpointSubtitle = uiState.endpoint,
                )
            }

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

            HaroldButton(
                text = stringResource(R.string.settings_save),
                onClick = onSave,
                variant = HaroldButtonVariant.Primary,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings_save"),
            )

            Spacer(modifier = Modifier.height(8.dp))
        }
    }

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
}
