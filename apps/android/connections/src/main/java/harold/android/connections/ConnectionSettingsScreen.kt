package harold.android.connections

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
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
}
