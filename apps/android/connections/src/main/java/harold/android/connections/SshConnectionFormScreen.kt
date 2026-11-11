package harold.android.connections

import android.content.ClipData
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Password
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import harold.android.credentials.SshCredentialKind
import harold.android.ui.components.HaroldAppearancePicker
import harold.android.ui.components.HaroldAppearancePreview
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldCheckboxRow
import harold.android.ui.components.HaroldCodeBox
import harold.android.ui.components.HaroldDropdownField
import harold.android.ui.components.HaroldDropdownOption
import harold.android.ui.components.HaroldFormScreen
import harold.android.ui.components.HaroldFormSection
import harold.android.ui.components.HaroldPasswordField
import harold.android.ui.components.HaroldReadOnlyField
import harold.android.ui.components.HaroldTextField
import harold.android.ui.debug.probeTag
import kotlinx.coroutines.launch

enum class SshConnectionFormMode {
    Add,
    Edit,
}

/**
 * The values the shared SSH form renders. [mode] is the only switch between
 * adding and editing: add owns the endpoint and can test it, edit shows the
 * saved endpoint and reuses the same sections around edit-only extras.
 */
data class SshConnectionFormState(
    val mode: SshConnectionFormMode,
    val name: String,
    val host: String,
    val port: String,
    val user: String,
    val authMode: SshAuthMode,
    val savedCredentials: List<SavedSshCredential> = emptyList(),
    val selectedCredentialId: String? = null,
    val publicKey: String? = null,
    val importedKey: String = "",
    val password: String = "",
    val credentialName: String = "",
    val colorId: String = "tide",
    val iconId: String = "terminal",
    val testing: Boolean = false,
    val testedFingerprint: String? = null,
    val trusted: Boolean = false,
    val canTest: Boolean = false,
    val canSave: Boolean = false,
    val errorMessage: String? = null,
    val endpointPreview: String = "",
    val savedFingerprint: String? = null,
    val currentAuthSummary: String? = null,
) {
    val endpointEditable: Boolean get() = mode == SshConnectionFormMode.Add

    val selectedCredential: SavedSshCredential?
        get() = savedCredentials.find { credential -> credential.id == selectedCredentialId }
}

data class SshConnectionFormActions(
    val onBack: () -> Unit,
    val onNameChanged: (String) -> Unit,
    val onColorSelected: (String) -> Unit,
    val onIconSelected: (String) -> Unit,
    val onSave: () -> Unit,
    val onHostChanged: (String) -> Unit = {},
    val onPortChanged: (String) -> Unit = {},
    val onUserChanged: (String) -> Unit = {},
    val onAuthModeChanged: (SshAuthMode) -> Unit = {},
    val onCredentialSelected: (String?) -> Unit = {},
    val onImportedKeyChanged: (String) -> Unit = {},
    val onPasswordChanged: (String) -> Unit = {},
    val onCredentialNameChanged: (String) -> Unit = {},
    val onTrustChanged: (Boolean) -> Unit = {},
    val onTest: () -> Unit = {},
    val onDeleteCredential: (String) -> Unit = {},
)

/**
 * Tags are overridable so the edit route can keep its established `settings_`
 * names while the add route keeps the `ssh_` names the demo driver knows.
 */
internal data class SshFormTags(
    val back: String = "ssh_setup_back",
    val name: String = "ssh_name_field",
    val host: String = "ssh_host_field",
    val user: String = "ssh_user_field",
    val port: String = "ssh_port_field",
    val fingerprint: String = "ssh_fingerprint",
    val authDropdown: String = "ssh_auth_dropdown",
    val authSummary: String = "settings_auth_summary",
    val colorPrefix: String = "ssh_color_",
    val iconPrefix: String = "ssh_icon_",
    val save: String = "ssh_save_button",
    val error: String = "ssh_error",
    val savedCredentialPrefix: String = "ssh_saved_credential_",
    val keepCurrentOption: String = "settings_credential_keep",
    val connectionSection: String = "ssh_connection_section",
    val authSection: String = "ssh_auth_section",
    val appearanceSection: String = "ssh_appearance_section",
    val fingerprintSection: String = "ssh_fingerprint_section",
)

private sealed interface AuthSelection {
    data class Saved(val credentialId: String) : AuthSelection

    data object Generate : AuthSelection

    data object Import : AuthSelection

    data object Password : AuthSelection

    data object KeepCurrent : AuthSelection
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SshConnectionFormScreen(
    state: SshConnectionFormState,
    actions: SshConnectionFormActions,
    tags: SshFormTags = SshFormTags(),
    snackbarHost: (@Composable () -> Unit)? = null,
    editExtras: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var authHelpVisible by remember { mutableStateOf(false) }
    var manageCredentialsVisible by remember { mutableStateOf(false) }
    val helpSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val managerSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    if (authHelpVisible) {
        ModalBottomSheet(
            onDismissRequest = { authHelpVisible = false },
            sheetState = helpSheetState,
        ) {
            SshAuthHelpSheet(onClose = { authHelpVisible = false })
        }
    }

    if (manageCredentialsVisible) {
        ModalBottomSheet(
            onDismissRequest = { manageCredentialsVisible = false },
            sheetState = managerSheetState,
        ) {
            SshCredentialManagerSheet(
                credentials = state.savedCredentials,
                onDelete = actions.onDeleteCredential,
                onClose = { manageCredentialsVisible = false },
            )
        }
    }

    HaroldFormScreen(
        title = stringResource(
            if (state.mode == SshConnectionFormMode.Add) {
                R.string.ssh_setup_title
            } else {
                R.string.settings_title
            },
        ),
        onBack = actions.onBack,
        backContentDescription = stringResource(
            if (state.mode == SshConnectionFormMode.Add) {
                R.string.connections_back_content_description
            } else {
                R.string.settings_back
            },
        ),
        backTestTag = tags.back,
        snackbarHost = snackbarHost,
    ) {
        val selectedCredential = state.selectedCredential
        val selectedAuth = when {
            selectedCredential != null -> AuthSelection.Saved(selectedCredential.id)
            state.mode == SshConnectionFormMode.Edit -> AuthSelection.KeepCurrent
            state.authMode == SshAuthMode.GeneratedKey -> AuthSelection.Generate
            state.authMode == SshAuthMode.ImportedKey -> AuthSelection.Import
            else -> AuthSelection.Password
        }
        val authOptions = authOptions(state, tags)

        HaroldFormSection(
            title = stringResource(R.string.ssh_connection_section_title),
            modifier = Modifier.testTag(tags.connectionSection),
        ) {
            HaroldTextField(
                value = state.name,
                onValueChange = actions.onNameChanged,
                label = stringResource(R.string.connections_name_label),
                fieldTestTag = tags.name,
            )

            if (state.endpointEditable) {
                HaroldTextField(
                    value = state.host,
                    onValueChange = actions.onHostChanged,
                    label = stringResource(R.string.ssh_host_label),
                    placeholder = stringResource(R.string.ssh_host_placeholder),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Outlined.Dns,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    fieldTestTag = tags.host,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    HaroldTextField(
                        value = state.user,
                        onValueChange = actions.onUserChanged,
                        label = stringResource(R.string.ssh_user_label),
                        placeholder = stringResource(R.string.ssh_user_placeholder),
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.Person,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        fieldTestTag = tags.user,
                        modifier = Modifier.weight(1f),
                    )
                    HaroldTextField(
                        value = state.port,
                        onValueChange = actions.onPortChanged,
                        label = stringResource(R.string.ssh_port_label),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        fieldTestTag = tags.port,
                        modifier = Modifier.width(104.dp),
                    )
                }
            } else {
                HaroldReadOnlyField(
                    label = stringResource(R.string.ssh_host_label),
                    value = state.host,
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Outlined.Dns,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    fieldTestTag = tags.host,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    HaroldReadOnlyField(
                        label = stringResource(R.string.ssh_user_label),
                        value = state.user,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.Person,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        fieldTestTag = tags.user,
                        modifier = Modifier.weight(1f),
                    )
                    HaroldReadOnlyField(
                        label = stringResource(R.string.ssh_port_label),
                        value = state.port,
                        fieldTestTag = tags.port,
                        modifier = Modifier.width(104.dp),
                    )
                }
                state.savedFingerprint?.takeIf { it.isNotBlank() }?.let { fingerprint ->
                    HaroldReadOnlyField(
                        label = stringResource(R.string.ssh_fingerprint_label),
                        value = fingerprint,
                        fieldTestTag = tags.fingerprint,
                        monospace = true,
                        singleLine = false,
                        maxLines = 2,
                    )
                }
            }
        }

        HaroldFormSection(
            title = stringResource(R.string.ssh_auth_label),
            modifier = Modifier.testTag(tags.authSection),
            headerAction = {
                if (state.mode == SshConnectionFormMode.Add && state.savedCredentials.isNotEmpty()) {
                    HeaderChipButton(
                        text = stringResource(R.string.ssh_credential_manage),
                        icon = {
                            Icon(
                                imageVector = Icons.Outlined.Settings,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                            )
                        },
                        onClick = { manageCredentialsVisible = true },
                        testTag = "ssh_manage_credentials",
                    )
                }
                HeaderChipButton(
                    text = stringResource(R.string.ssh_auth_help),
                    icon = {
                        Icon(
                            imageVector = Icons.Outlined.Info,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                        )
                    },
                    onClick = { authHelpVisible = true },
                    testTag = "ssh_auth_help",
                )
            },
        ) {
            if (state.mode == SshConnectionFormMode.Edit) {
                state.currentAuthSummary?.takeIf { it.isNotBlank() }?.let { summary ->
                    Text(
                        text = summary,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.testTag(tags.authSummary),
                    )
                }
            }

            HaroldDropdownField(
                label = stringResource(
                    if (state.mode == SshConnectionFormMode.Add) {
                        R.string.ssh_auth_select_label
                    } else {
                        R.string.settings_credential_pick
                    },
                ),
                options = authOptions,
                selectedValue = selectedAuth,
                onOptionSelected = { selection ->
                    when (selection) {
                        is AuthSelection.Saved -> actions.onCredentialSelected(selection.credentialId)
                        AuthSelection.KeepCurrent -> actions.onCredentialSelected(null)
                        AuthSelection.Generate -> {
                            actions.onCredentialSelected(null)
                            actions.onAuthModeChanged(SshAuthMode.GeneratedKey)
                        }
                        AuthSelection.Import -> {
                            actions.onCredentialSelected(null)
                            actions.onAuthModeChanged(SshAuthMode.ImportedKey)
                        }
                        AuthSelection.Password -> {
                            actions.onCredentialSelected(null)
                            actions.onAuthModeChanged(SshAuthMode.Password)
                        }
                    }
                },
                anchorTestTag = tags.authDropdown,
            )

            if (selectedCredential == null && state.mode == SshConnectionFormMode.Add) {
                HaroldTextField(
                    value = state.credentialName,
                    onValueChange = actions.onCredentialNameChanged,
                    label = stringResource(R.string.ssh_credential_name_label),
                    fieldTestTag = "ssh_credential_name_field",
                )
            }

            when {
                selectedCredential != null -> {
                    if (selectedCredential.kind == SshCredentialKind.PrivateKey) {
                        val publicKey = selectedCredential.publicKey.orEmpty()
                        if (publicKey.isNotBlank()) {
                            HaroldCodeBox(
                                code = publicKey,
                                label = stringResource(R.string.ssh_credential_public_key_label),
                                hint = stringResource(R.string.ssh_public_key_hint),
                                copyLabel = stringResource(R.string.ssh_copy_public_key),
                                copiedLabel = stringResource(R.string.ssh_copied_public_key),
                                onCopy = {
                                    scope.launch {
                                        clipboard.setClipEntry(
                                            ClipEntry(
                                                ClipData.newPlainText("SSH Public Key", publicKey),
                                            ),
                                        )
                                    }
                                },
                                codeTestTag = "ssh_public_key",
                                copyButtonTestTag = "ssh_copy_public_key",
                                maxLines = 3,
                                showContainer = false,
                            )
                        }
                    } else {
                        SavedPasswordNotice()
                    }
                }

                state.mode == SshConnectionFormMode.Edit -> Unit

                state.authMode == SshAuthMode.GeneratedKey -> {
                    HaroldCodeBox(
                        code = state.publicKey.orEmpty(),
                        label = stringResource(R.string.ssh_public_key_label),
                        hint = stringResource(R.string.ssh_public_key_hint),
                        copyLabel = stringResource(R.string.ssh_copy_public_key),
                        copiedLabel = stringResource(R.string.ssh_copied_public_key),
                        onCopy = {
                            state.publicKey?.let { key ->
                                scope.launch {
                                    clipboard.setClipEntry(
                                        ClipEntry(ClipData.newPlainText("SSH Public Key", key)),
                                    )
                                }
                            }
                        },
                        codeTestTag = "ssh_public_key",
                        copyButtonTestTag = "ssh_copy_public_key",
                        showContainer = false,
                    )
                }

                state.authMode == SshAuthMode.ImportedKey -> {
                    HaroldTextField(
                        value = state.importedKey,
                        onValueChange = actions.onImportedKeyChanged,
                        label = stringResource(R.string.ssh_imported_key_label),
                        placeholder = stringResource(R.string.ssh_imported_key_placeholder),
                        textStyle = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                        ),
                        singleLine = false,
                        minLines = 4,
                        maxLines = 8,
                        fieldTestTag = "ssh_imported_key_field",
                    )
                }

                state.authMode == SshAuthMode.Password -> {
                    HaroldPasswordField(
                        value = state.password,
                        onValueChange = actions.onPasswordChanged,
                        label = stringResource(R.string.ssh_password_label),
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.Lock,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        fieldTestTag = "ssh_password_field",
                        visibilityToggleTag = "ssh_password_visibility_toggle",
                    )
                }
            }
        }

        if (state.mode == SshConnectionFormMode.Add) {
            if (state.testing) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surfaceContainer,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("ssh_testing"),
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.5.dp,
                        )
                        Text(
                            text = stringResource(R.string.ssh_testing),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            } else {
                HaroldButton(
                    text = stringResource(R.string.ssh_test_button),
                    onClick = actions.onTest,
                    enabled = state.canTest,
                    variant = HaroldButtonVariant.Secondary,
                    modifier = Modifier
                        .fillMaxWidth()
                        .probeTag("ssh_test_button", state.canTest),
                )
            }

            state.errorMessage?.let { message ->
                SshFormErrorMessage(message = message, testTag = tags.error)
            }

            state.testedFingerprint?.let { fingerprint ->
                HaroldFormSection(
                    title = stringResource(R.string.ssh_fingerprint_label),
                    subtitle = stringResource(R.string.ssh_fingerprint_hint),
                    modifier = Modifier.testTag(tags.fingerprintSection),
                ) {
                    HaroldCodeBox(
                        code = fingerprint,
                        codeTestTag = tags.fingerprint,
                    )
                    HaroldCheckboxRow(
                        checked = state.trusted,
                        onCheckedChange = actions.onTrustChanged,
                        label = stringResource(R.string.ssh_trust_label),
                        checkboxTestTag = "ssh_trust_checkbox",
                    )
                }
            }
        }

        HaroldFormSection(
            title = stringResource(R.string.ssh_appearance_section_title),
            modifier = Modifier.testTag(tags.appearanceSection),
        ) {
            HaroldAppearancePicker(
                colorId = state.colorId,
                iconId = state.iconId,
                onColorSelected = actions.onColorSelected,
                onIconSelected = actions.onIconSelected,
                colorLabel = stringResource(R.string.connections_color_label),
                iconLabel = stringResource(R.string.connections_icon_label),
                colorTagPrefix = tags.colorPrefix,
                iconTagPrefix = tags.iconPrefix,
            )
            HaroldAppearancePreview(
                name = state.name,
                colorId = state.colorId,
                iconId = state.iconId,
                endpointSubtitle = state.endpointPreview,
            )
        }

        if (state.mode == SshConnectionFormMode.Edit) {
            editExtras?.invoke(this)
            state.errorMessage?.let { message ->
                SshFormErrorMessage(message = message, testTag = tags.error)
            }
        }

        val saveEnabled = if (state.mode == SshConnectionFormMode.Add) state.canSave else true
        HaroldButton(
            text = stringResource(
                if (state.mode == SshConnectionFormMode.Add) {
                    R.string.ssh_save_button
                } else {
                    R.string.settings_save
                },
            ),
            onClick = actions.onSave,
            enabled = saveEnabled,
            variant = HaroldButtonVariant.Primary,
            modifier = Modifier
                .fillMaxWidth()
                .probeTag(tags.save, saveEnabled),
        )

        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
private fun authOptions(
    state: SshConnectionFormState,
    tags: SshFormTags,
): List<HaroldDropdownOption<AuthSelection>> {
    val options = mutableListOf<HaroldDropdownOption<AuthSelection>>()

    if (state.mode == SshConnectionFormMode.Edit) {
        options.add(
            HaroldDropdownOption(
                value = AuthSelection.KeepCurrent,
                label = stringResource(R.string.settings_credential_keep),
                testTag = tags.keepCurrentOption,
            ),
        )
    }

    state.savedCredentials.forEach { credential ->
        options.add(
            HaroldDropdownOption(
                value = AuthSelection.Saved(credential.id),
                label = credential.name,
                subtitle = credentialKindLabel(credential.kind),
                testTag = "${tags.savedCredentialPrefix}${credential.id}",
            ),
        )
    }

    if (state.mode == SshConnectionFormMode.Add) {
        options.add(
            HaroldDropdownOption(
                value = AuthSelection.Generate,
                label = stringResource(R.string.ssh_auth_generate),
                testTag = "ssh_auth_generate",
            ),
        )
        options.add(
            HaroldDropdownOption(
                value = AuthSelection.Import,
                label = stringResource(R.string.ssh_auth_import),
                testTag = "ssh_auth_import",
            ),
        )
        options.add(
            HaroldDropdownOption(
                value = AuthSelection.Password,
                label = stringResource(R.string.ssh_auth_password),
                testTag = "ssh_auth_password",
            ),
        )
    }

    return options
}

@Composable
private fun SshFormErrorMessage(
    message: String,
    testTag: String,
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f)),
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
                text = message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier
                    .testTag(testTag)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
    }
}

@Composable
private fun HeaderChipButton(
    text: String,
    icon: @Composable () -> Unit,
    onClick: () -> Unit,
    testTag: String,
    highlighted: Boolean = false,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (highlighted) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
        } else {
            MaterialTheme.colorScheme.surfaceContainerHigh
        },
        border = BorderStroke(
            width = 1.dp,
            color = if (highlighted) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)
            } else {
                MaterialTheme.colorScheme.outlineVariant
            },
        ),
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .testTag(testTag),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            icon()
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                color = if (highlighted) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

@Composable
private fun CredentialKindIcon(kind: SshCredentialKind) {
    Icon(
        imageVector = when (kind) {
            SshCredentialKind.PrivateKey -> Icons.Filled.Key
            SshCredentialKind.Password -> Icons.Filled.Password
        },
        contentDescription = null,
        tint = MaterialTheme.colorScheme.primary,
        modifier = Modifier.size(18.dp),
    )
}

@Composable
private fun SavedPasswordNotice() {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.VerifiedUser,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = stringResource(R.string.ssh_credential_password_saved),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SshAuthHelpSheet(onClose: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp)
            .padding(bottom = 28.dp)
            .testTag("ssh_auth_help_sheet"),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = stringResource(R.string.ssh_auth_help_title),
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        )
        Text(
            text = stringResource(R.string.ssh_auth_help_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        AuthHelpSection(
            title = stringResource(R.string.ssh_auth_help_storage_title),
            body = stringResource(R.string.ssh_auth_help_storage_body),
        )
        AuthHelpSection(
            title = stringResource(R.string.ssh_auth_help_privacy_title),
            body = stringResource(R.string.ssh_auth_help_privacy_body),
        )
        AuthHelpSection(
            title = stringResource(R.string.ssh_auth_help_reuse_title),
            body = stringResource(R.string.ssh_auth_help_reuse_body),
        )

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        Text(
            text = stringResource(R.string.ssh_auth_help_choose_title),
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        )
        AuthHelpSection(
            title = stringResource(R.string.ssh_auth_help_generate_title),
            body = stringResource(R.string.ssh_auth_help_generate_body),
        )
        AuthHelpSection(
            title = stringResource(R.string.ssh_auth_help_import_title),
            body = stringResource(R.string.ssh_auth_help_import_body),
        )
        AuthHelpSection(
            title = stringResource(R.string.ssh_auth_help_password_title),
            body = stringResource(R.string.ssh_auth_help_password_body),
        )
        AuthHelpSection(
            title = stringResource(R.string.ssh_auth_help_pinning_title),
            body = stringResource(R.string.ssh_auth_help_pinning_body),
        )

        HaroldButton(
            text = stringResource(R.string.ssh_auth_help_close),
            onClick = onClose,
            variant = HaroldButtonVariant.Primary,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("ssh_auth_help_close"),
        )
    }
}

@Composable
private fun AuthHelpSection(title: String, body: String) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun credentialKindLabel(kind: SshCredentialKind): String =
    stringResource(
        when (kind) {
            SshCredentialKind.PrivateKey -> R.string.ssh_credential_kind_key
            SshCredentialKind.Password -> R.string.ssh_credential_kind_password
        },
    )

@Composable
private fun SshCredentialManagerSheet(
    credentials: List<SavedSshCredential>,
    onDelete: (String) -> Unit,
    onClose: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp)
            .padding(bottom = 28.dp)
            .testTag("ssh_credential_manager_sheet"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.ssh_credential_manager_title),
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        )
        Text(
            text = stringResource(R.string.ssh_credential_manager_note),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (credentials.isEmpty()) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceContainer,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(R.string.ssh_credential_manager_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }
        } else {
            credentials.forEach { credential ->
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceContainer,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 14.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                            modifier = Modifier.size(36.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                CredentialKindIcon(kind = credential.kind)
                            }
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                text = credential.name,
                                style = MaterialTheme.typography.titleSmall.copy(
                                    fontWeight = FontWeight.SemiBold,
                                ),
                            )
                            Text(
                                text = credentialKindLabel(credential.kind),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(
                            onClick = { onDelete(credential.id) },
                            modifier = Modifier.testTag("ssh_credential_delete_${credential.id}"),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Delete,
                                contentDescription = stringResource(R.string.ssh_credential_delete),
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }
        }
        HaroldButton(
            text = stringResource(R.string.ssh_credential_done),
            onClick = onClose,
            variant = HaroldButtonVariant.Primary,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("ssh_credential_manager_close"),
        )
    }
}
