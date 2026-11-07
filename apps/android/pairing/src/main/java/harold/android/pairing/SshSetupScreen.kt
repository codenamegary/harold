package harold.android.pairing

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import harold.android.credentials.SshCredentialKind
import harold.android.ui.components.HaroldAppearanceEditor
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant

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
    val clipboard = LocalClipboardManager.current
    var authHelpVisible by remember { mutableStateOf(false) }
    var manageCredentialsVisible by remember { mutableStateOf(false) }
    var credentialMenuExpanded by remember { mutableStateOf(false) }
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
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.ssh_setup_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("ssh_setup_back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.pairing_back_content_description),
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
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            OutlinedTextField(
                value = uiState.host,
                onValueChange = onHostChanged,
                label = { Text(text = stringResource(R.string.ssh_host_label)) },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("ssh_host_field"),
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = uiState.port,
                    onValueChange = onPortChanged,
                    label = { Text(text = stringResource(R.string.ssh_port_label)) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .width(120.dp)
                        .testTag("ssh_port_field"),
                )
                OutlinedTextField(
                    value = uiState.user,
                    onValueChange = onUserChanged,
                    label = { Text(text = stringResource(R.string.ssh_user_label)) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .weight(1f)
                        .testTag("ssh_user_field"),
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = stringResource(R.string.ssh_auth_label),
                    style = MaterialTheme.typography.labelLarge,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier
                        .clickable { authHelpVisible = true }
                        .semantics { role = Role.Button }
                        .padding(horizontal = 6.dp, vertical = 4.dp)
                        .testTag("ssh_auth_help"),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Info,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = stringResource(R.string.ssh_auth_help),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            if (uiState.savedCredentials.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.ssh_saved_credential_label),
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(
                        onClick = { manageCredentialsVisible = true },
                        modifier = Modifier.testTag("ssh_manage_credentials"),
                    ) {
                        Text(text = stringResource(R.string.ssh_credential_manage))
                    }
                }
                Box {
                    OutlinedButton(
                        onClick = { credentialMenuExpanded = true },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("ssh_saved_credential_button"),
                    ) {
                        Text(
                            text = uiState.selectedCredential?.let { credential ->
                                "${credential.name} (${credentialKindLabel(credential.kind)})"
                            } ?: stringResource(R.string.ssh_credential_new),
                            modifier = Modifier.weight(1f),
                        )
                        Icon(
                            imageVector = Icons.Filled.ArrowDropDown,
                            contentDescription = null,
                        )
                    }
                    DropdownMenu(
                        expanded = credentialMenuExpanded,
                        onDismissRequest = { credentialMenuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.ssh_credential_new)) },
                            onClick = {
                                credentialMenuExpanded = false
                                onCredentialSelected(null)
                            },
                            modifier = Modifier.testTag("ssh_credential_new"),
                        )
                        uiState.savedCredentials.forEach { credential ->
                            DropdownMenuItem(
                                text = {
                                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(text = credential.name)
                                        Text(
                                            text = credentialKindLabel(credential.kind),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                },
                                onClick = {
                                    credentialMenuExpanded = false
                                    onCredentialSelected(credential.id)
                                },
                                modifier = Modifier.testTag(
                                    "ssh_saved_credential_${credential.id}",
                                ),
                            )
                        }
                    }
                }
            }

            val selectedCredential = uiState.selectedCredential
            if (selectedCredential != null) {
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = selectedCredential.name,
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = credentialKindLabel(selectedCredential.kind),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (selectedCredential.kind == SshCredentialKind.PrivateKey) {
                            Text(
                                text = stringResource(R.string.ssh_credential_public_key_label),
                                style = MaterialTheme.typography.labelLarge,
                            )
                            SelectionContainer {
                                Text(
                                    text = selectedCredential.publicKey.orEmpty(),
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = FontFamily.Monospace,
                                    maxLines = 3,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        } else {
                            Text(
                                text = stringResource(R.string.ssh_credential_password_saved),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = uiState.authMode == SshAuthMode.GeneratedKey,
                        onClick = { onAuthModeChanged(SshAuthMode.GeneratedKey) },
                        label = { Text(stringResource(R.string.ssh_auth_generate)) },
                        modifier = Modifier.testTag("ssh_auth_generate"),
                    )
                    FilterChip(
                        selected = uiState.authMode == SshAuthMode.ImportedKey,
                        onClick = { onAuthModeChanged(SshAuthMode.ImportedKey) },
                        label = { Text(stringResource(R.string.ssh_auth_import)) },
                        modifier = Modifier.testTag("ssh_auth_import"),
                    )
                    FilterChip(
                        selected = uiState.authMode == SshAuthMode.Password,
                        onClick = { onAuthModeChanged(SshAuthMode.Password) },
                        label = { Text(stringResource(R.string.ssh_auth_password)) },
                        modifier = Modifier.testTag("ssh_auth_password"),
                    )
                }

                OutlinedTextField(
                    value = uiState.credentialName,
                    onValueChange = onCredentialNameChanged,
                    label = { Text(text = stringResource(R.string.ssh_credential_name_label)) },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("ssh_credential_name_field"),
                )

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = uiState.saveCredentialForReuse,
                        onCheckedChange = onSaveCredentialForReuseChanged,
                        modifier = Modifier.testTag("ssh_save_credential_checkbox"),
                    )
                    Text(
                        text = stringResource(R.string.ssh_credential_save_for_reuse),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }

                when (uiState.authMode) {
                    SshAuthMode.GeneratedKey -> {
                        Card(
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                            ),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    text = stringResource(R.string.ssh_public_key_label),
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                Text(
                                    text = stringResource(R.string.ssh_public_key_hint),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                SelectionContainer {
                                    Text(
                                        text = uiState.publicKey.orEmpty(),
                                        style = MaterialTheme.typography.bodySmall,
                                        fontFamily = FontFamily.Monospace,
                                        modifier = Modifier.testTag("ssh_public_key"),
                                    )
                                }
                                TextButton(
                                    onClick = {
                                        uiState.publicKey?.let { key ->
                                            clipboard.setText(AnnotatedString(key))
                                        }
                                    },
                                    modifier = Modifier.testTag("ssh_copy_public_key"),
                                ) {
                                    Text(text = stringResource(R.string.ssh_copy_public_key))
                                }
                            }
                        }
                    }
                    SshAuthMode.ImportedKey -> {
                        OutlinedTextField(
                            value = uiState.importedKey,
                            onValueChange = onImportedKeyChanged,
                            label = { Text(text = stringResource(R.string.ssh_imported_key_label)) },
                            minLines = 4,
                            maxLines = 8,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("ssh_imported_key_field"),
                        )
                    }
                    SshAuthMode.Password -> {
                        OutlinedTextField(
                            value = uiState.password,
                            onValueChange = onPasswordChanged,
                            label = { Text(text = stringResource(R.string.ssh_password_label)) },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("ssh_password_field"),
                        )
                    }
                }
            }

            HaroldAppearanceEditor(
                name = uiState.name,
                colorId = uiState.colorId,
                iconId = uiState.iconId,
                onNameChanged = onNameChanged,
                onColorSelected = onColorSelected,
                onIconSelected = onIconSelected,
                nameLabel = stringResource(R.string.pairing_name_label),
                colorLabel = stringResource(R.string.pairing_color_label),
                iconLabel = stringResource(R.string.pairing_icon_label),
                nameFieldTag = "ssh_name_field",
                colorTagPrefix = "ssh_color_",
                iconTagPrefix = "ssh_icon_",
                endpointSubtitle = "${uiState.user}@${uiState.host}:${uiState.port}",
            )

            if (uiState.testing) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator()
                    Text(text = stringResource(R.string.ssh_testing))
                }
            } else {
                HaroldButton(
                    text = stringResource(R.string.ssh_test_button),
                    onClick = onTest,
                    enabled = uiState.canTest,
                    variant = HaroldButtonVariant.Secondary,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("ssh_test_button"),
                )
            }

            uiState.testedFingerprint?.let { fingerprint ->
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.ssh_fingerprint_label),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        SelectionContainer {
                            Text(
                                text = fingerprint,
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                modifier = Modifier.testTag("ssh_fingerprint"),
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(
                                checked = uiState.trusted,
                                onCheckedChange = onTrustChanged,
                                modifier = Modifier.testTag("ssh_trust_checkbox"),
                            )
                            Text(
                                text = stringResource(R.string.ssh_trust_label),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
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
                    .testTag("ssh_save_button"),
            )

            uiState.errorMessage?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("ssh_error"),
                )
            }
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
            style = MaterialTheme.typography.headlineSmall,
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

        Text(
            text = stringResource(R.string.ssh_auth_help_choose_title),
            style = MaterialTheme.typography.titleMedium,
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
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = stringResource(R.string.ssh_credential_manager_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = stringResource(R.string.ssh_credential_manager_note),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (credentials.isEmpty()) {
            Text(
                text = stringResource(R.string.ssh_credential_manager_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            credentials.forEach { credential ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            text = credential.name,
                            style = MaterialTheme.typography.titleSmall,
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
                HorizontalDivider()
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
