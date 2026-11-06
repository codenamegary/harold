package harold.android.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
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
) {
    val clipboard = LocalClipboardManager.current

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
            Text(
                text = stringResource(R.string.ssh_setup_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

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

            Text(
                text = stringResource(R.string.ssh_auth_label),
                style = MaterialTheme.typography.labelLarge,
            )
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
