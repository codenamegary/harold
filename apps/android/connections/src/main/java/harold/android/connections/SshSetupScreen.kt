package harold.android.connections

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Password
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.UploadFile
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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import android.content.ClipData
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import harold.android.credentials.SshCredentialKind
import harold.android.ui.components.HaroldAppearanceEditor
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
import harold.android.ui.components.HaroldCheckboxRow
import harold.android.ui.components.HaroldCodeBox
import harold.android.ui.components.HaroldDropdownOption
import harold.android.ui.components.HaroldExposedDropdown
import harold.android.ui.components.HaroldFormSection
import harold.android.ui.components.HaroldPasswordField
import harold.android.ui.components.HaroldSegmentOption
import harold.android.ui.components.HaroldSegmentedControl
import harold.android.ui.components.HaroldSelectableCard
import harold.android.ui.components.HaroldTextField
import harold.android.ui.debug.probeTag

private enum class AuthTabSelection {
    Saved,
    Generate,
    Import,
    Password,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SshSetupScreen(
    uiState: SshSetupUiState,
    onBack: () -> Unit,
    onHostChanged: (String) -> Unit,
    onPortChanged: (String) -> Unit,
    onUserChanged: (String) -> Unit,
    onNameChanged: (String) -> Unit,
    onAuthModeChanged: (SshAuthMode) -> Unit,
    onImportedKeyChanged: (String) -> Unit,
    onPasswordChanged: (String) -> Unit,
    onColorSelected: (String) -> Unit,
    onIconSelected: (String) -> Unit,
    onTrustChanged: (Boolean) -> Unit,
    onTest: () -> Unit,
    onSave: () -> Unit,
    onCredentialSelected: (String?) -> Unit,
    onCredentialNameChanged: (String) -> Unit,
    onSaveCredentialForReuseChanged: (Boolean) -> Unit,
    onDeleteCredential: (String) -> Unit,
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
                credentials = uiState.savedCredentials,
                onDelete = onDeleteCredential,
                onClose = { manageCredentialsVisible = false },
            )
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.ssh_setup_title),
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("ssh_setup_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.connections_back_content_description),
                        )
                    }
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
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Section 1: Appearance
            val endpointPreview = buildString {
                val userPart = uiState.user.ifBlank { "user" }
                val hostPart = uiState.host.ifBlank { "host" }
                val portPart = uiState.port.ifBlank { "22" }
                append("$userPart@$hostPart:$portPart")
            }

            HaroldFormSection(
                title = stringResource(R.string.ssh_appearance_section_title),
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
                    nameFieldTag = "ssh_name_field",
                    colorTagPrefix = "ssh_color_",
                    iconTagPrefix = "ssh_icon_",
                    endpointSubtitle = endpointPreview,
                    previewAtEnd = true,
                )
            }

            // Section 2: Connection Details
            HaroldFormSection(
                title = stringResource(R.string.ssh_connection_section_title),
            ) {
                HaroldTextField(
                    value = uiState.host,
                    onValueChange = onHostChanged,
                    label = stringResource(R.string.ssh_host_label),
                    placeholder = stringResource(R.string.ssh_host_placeholder),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Outlined.Dns,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    fieldTestTag = "ssh_host_field",
                    modifier = Modifier.fillMaxWidth(),
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    HaroldTextField(
                        value = uiState.user,
                        onValueChange = onUserChanged,
                        label = stringResource(R.string.ssh_user_label),
                        placeholder = stringResource(R.string.ssh_user_placeholder),
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.Person,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        fieldTestTag = "ssh_user_field",
                        modifier = Modifier.weight(1f),
                    )
                    HaroldTextField(
                        value = uiState.port,
                        onValueChange = onPortChanged,
                        label = stringResource(R.string.ssh_port_label),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        fieldTestTag = "ssh_port_field",
                        modifier = Modifier.width(104.dp),
                    )
                }
            }

            // Section 3: Authentication
            HaroldFormSection(
                title = stringResource(R.string.ssh_auth_label),
                headerAction = {
                    if (uiState.savedCredentials.isNotEmpty()) {
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
                val hasSavedCredentials = uiState.savedCredentials.isNotEmpty()
                val selectedCredential = uiState.selectedCredential
                val activeTab = if (selectedCredential != null) {
                    AuthTabSelection.Saved
                } else {
                    when (uiState.authMode) {
                        SshAuthMode.GeneratedKey -> AuthTabSelection.Generate
                        SshAuthMode.ImportedKey -> AuthTabSelection.Import
                        SshAuthMode.Password -> AuthTabSelection.Password
                    }
                }

                HaroldSegmentedControl(
                    options = buildList {
                        if (hasSavedCredentials) {
                            add(
                                HaroldSegmentOption(
                                    value = AuthTabSelection.Saved,
                                    label = stringResource(R.string.ssh_auth_saved),
                                    testTag = "ssh_credential_mode_saved",
                                ),
                            )
                        }
                        add(
                            HaroldSegmentOption(
                                value = AuthTabSelection.Generate,
                                label = if (hasSavedCredentials) {
                                    stringResource(R.string.ssh_auth_generate_short)
                                } else {
                                    stringResource(R.string.ssh_auth_generate)
                                },
                                testTag = "ssh_auth_generate",
                                leadingIcon = if (!hasSavedCredentials) {
                                    {
                                        Icon(
                                            imageVector = Icons.Filled.Key,
                                            contentDescription = null,
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                } else {
                                    null
                                },
                            ),
                        )
                        add(
                            HaroldSegmentOption(
                                value = AuthTabSelection.Import,
                                label = if (hasSavedCredentials) {
                                    stringResource(R.string.ssh_auth_import_short)
                                } else {
                                    stringResource(R.string.ssh_auth_import)
                                },
                                testTag = "ssh_auth_import",
                                leadingIcon = if (!hasSavedCredentials) {
                                    {
                                        Icon(
                                            imageVector = Icons.Filled.UploadFile,
                                            contentDescription = null,
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                } else {
                                    null
                                },
                            ),
                        )
                        add(
                            HaroldSegmentOption(
                                value = AuthTabSelection.Password,
                                label = stringResource(R.string.ssh_auth_password),
                                testTag = "ssh_auth_password",
                                leadingIcon = if (!hasSavedCredentials) {
                                    {
                                        Icon(
                                            imageVector = Icons.Filled.Password,
                                            contentDescription = null,
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                } else {
                                    null
                                },
                            ),
                        )
                    },
                    selected = activeTab,
                    onSelect = { tab ->
                        when (tab) {
                            AuthTabSelection.Saved -> {
                                val targetId = uiState.selectedCredentialId
                                    ?: uiState.savedCredentials.firstOrNull()?.id
                                onCredentialSelected(targetId)
                            }
                            AuthTabSelection.Generate -> {
                                if (selectedCredential != null) onCredentialSelected(null)
                                onAuthModeChanged(SshAuthMode.GeneratedKey)
                            }
                            AuthTabSelection.Import -> {
                                if (selectedCredential != null) onCredentialSelected(null)
                                onAuthModeChanged(SshAuthMode.ImportedKey)
                            }
                            AuthTabSelection.Password -> {
                                if (selectedCredential != null) onCredentialSelected(null)
                                onAuthModeChanged(SshAuthMode.Password)
                            }
                        }
                    },
                )

                if (selectedCredential != null) {
                    if (uiState.savedCredentials.size <= 3) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            uiState.savedCredentials.forEach { credential ->
                                val isSelected = credential.id == selectedCredential.id
                                HaroldSelectableCard(
                                    title = credential.name,
                                    subtitle = credentialKindLabel(credential.kind),
                                    selected = isSelected,
                                    onClick = { onCredentialSelected(credential.id) },
                                    leadingIcon = {
                                        CredentialKindIcon(kind = credential.kind)
                                    },
                                    modifier = Modifier.testTag(
                                        "ssh_saved_credential_${credential.id}",
                                    ),
                                )
                            }
                        }
                    } else {
                        val credentialOptions = uiState.savedCredentials.map { credential ->
                            val kindText = credentialKindLabel(credential.kind)
                            HaroldDropdownOption(
                                value = credential.id,
                                label = credential.name,
                                subtitle = kindText,
                                leadingIcon = {
                                    CredentialKindIcon(kind = credential.kind)
                                },
                                testTag = "ssh_saved_credential_${credential.id}",
                            )
                        }

                        HaroldExposedDropdown(
                            options = credentialOptions,
                            selectedValue = selectedCredential.id,
                            onOptionSelected = { id -> onCredentialSelected(id) },
                            label = stringResource(R.string.ssh_saved_credential_label),
                            anchorTestTag = "ssh_saved_credential_button",
                            footerItem = { dismiss ->
                                HorizontalDivider(
                                    modifier = Modifier.padding(vertical = 4.dp),
                                    color = MaterialTheme.colorScheme.outlineVariant,
                                )
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
                                            text = stringResource(R.string.ssh_credential_new),
                                            style = MaterialTheme.typography.bodyLarge.copy(
                                                fontWeight = FontWeight.Medium,
                                            ),
                                            color = MaterialTheme.colorScheme.primary,
                                        )
                                    },
                                    onClick = {
                                        dismiss()
                                        onCredentialSelected(null)
                                    },
                                    modifier = Modifier.testTag("ssh_credential_new"),
                                )
                            },
                        )
                    }

                    if (selectedCredential.kind == SshCredentialKind.PrivateKey) {
                        val pubKey = selectedCredential.publicKey.orEmpty()
                        if (pubKey.isNotBlank()) {
                            HaroldCodeBox(
                                code = pubKey,
                                label = stringResource(R.string.ssh_credential_public_key_label),
                                hint = stringResource(R.string.ssh_public_key_hint),
                                copyLabel = stringResource(R.string.ssh_copy_public_key),
                                copiedLabel = stringResource(R.string.ssh_copied_public_key),
                                onCopy = {
                                    scope.launch {
                                        clipboard.setClipEntry(
                                            ClipEntry(ClipData.newPlainText("SSH Public Key", pubKey)),
                                        )
                                    }
                                },
                                maxLines = 3,
                            )
                        }
                    } else {
                        SavedPasswordNotice()
                    }
                } else {

                    when (uiState.authMode) {
                        SshAuthMode.GeneratedKey -> {
                            HaroldCodeBox(
                                code = uiState.publicKey.orEmpty(),
                                label = stringResource(R.string.ssh_public_key_label),
                                hint = stringResource(R.string.ssh_public_key_hint),
                                copyLabel = stringResource(R.string.ssh_copy_public_key),
                                copiedLabel = stringResource(R.string.ssh_copied_public_key),
                                onCopy = {
                                    uiState.publicKey?.let { key ->
                                        scope.launch {
                                            clipboard.setClipEntry(
                                                ClipEntry(ClipData.newPlainText("SSH Public Key", key)),
                                            )
                                        }
                                    }
                                },
                                codeTestTag = "ssh_public_key",
                                copyButtonTestTag = "ssh_copy_public_key",
                            )
                        }

                        SshAuthMode.ImportedKey -> {
                            HaroldTextField(
                                value = uiState.importedKey,
                                onValueChange = onImportedKeyChanged,
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

                        SshAuthMode.Password -> {
                            HaroldPasswordField(
                                value = uiState.password,
                                onValueChange = onPasswordChanged,
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

                    HaroldCheckboxRow(
                        checked = uiState.saveCredentialForReuse,
                        onCheckedChange = onSaveCredentialForReuseChanged,
                        label = stringResource(R.string.ssh_credential_save_for_reuse),
                        subtitle = stringResource(R.string.ssh_credential_save_for_reuse_subtitle),
                        checkboxTestTag = "ssh_save_credential_checkbox",
                    )

                    if (uiState.saveCredentialForReuse) {
                        HaroldTextField(
                            value = uiState.credentialName,
                            onValueChange = onCredentialNameChanged,
                            label = stringResource(R.string.ssh_credential_name_label),
                            leadingIcon = {
                                CredentialKindIcon(
                                    kind = if (uiState.authMode == SshAuthMode.Password) {
                                        SshCredentialKind.Password
                                    } else {
                                        SshCredentialKind.PrivateKey
                                    },
                                )
                            },
                            fieldTestTag = "ssh_credential_name_field",
                        )
                    }
                }
            }

            // Section 4: Host Verification & Actions
            if (uiState.testing) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surfaceContainer,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.5.dp)
                        Text(
                            text = stringResource(R.string.ssh_testing),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            } else {
                HaroldButton(
                    text = stringResource(R.string.ssh_test_button),
                    onClick = onTest,
                    enabled = uiState.canTest,
                    variant = HaroldButtonVariant.Secondary,
                    modifier = Modifier
                        .fillMaxWidth()
                        .probeTag("ssh_test_button", uiState.canTest),
                )
            }

            uiState.testedFingerprint?.let { fingerprint ->
                HaroldFormSection(
                    title = stringResource(R.string.ssh_fingerprint_label),
                    subtitle = stringResource(R.string.ssh_fingerprint_hint),
                ) {
                    HaroldCodeBox(
                        code = fingerprint,
                        codeTestTag = "ssh_fingerprint",
                    )
                    HaroldCheckboxRow(
                        checked = uiState.trusted,
                        onCheckedChange = onTrustChanged,
                        label = stringResource(R.string.ssh_trust_label),
                        checkboxTestTag = "ssh_trust_checkbox",
                    )
                }
            }

            uiState.errorMessage?.let { message ->
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
                                .testTag("ssh_error")
                                .semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                }
            }

            HaroldButton(
                text = stringResource(R.string.ssh_save_button),
                onClick = onSave,
                enabled = uiState.canSave,
                variant = HaroldButtonVariant.Primary,
                modifier = Modifier
                    .fillMaxWidth()
                    .probeTag("ssh_save_button", uiState.canSave),
            )

            Spacer(modifier = Modifier.height(8.dp))
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
