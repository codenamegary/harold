package harold.android.connections

import androidx.compose.runtime.Composable

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
    onDeleteCredential: (String) -> Unit,
) {
    val userPart = uiState.user.ifBlank { "user" }
    val hostPart = uiState.host.ifBlank { "host" }
    val portPart = uiState.port.ifBlank { "22" }

    SshConnectionFormScreen(
        state = SshConnectionFormState(
            mode = SshConnectionFormMode.Add,
            name = uiState.name,
            host = uiState.host,
            port = uiState.port,
            user = uiState.user,
            authMode = uiState.authMode,
            savedCredentials = uiState.savedCredentials,
            selectedCredentialId = uiState.selectedCredentialId,
            publicKey = uiState.publicKey,
            importedKey = uiState.importedKey,
            password = uiState.password,
            credentialName = uiState.credentialName,
            colorId = uiState.colorId,
            iconId = uiState.iconId,
            testing = uiState.testing,
            testedFingerprint = uiState.testedFingerprint,
            trusted = uiState.trusted,
            canTest = uiState.canTest,
            canSave = uiState.canSave,
            errorMessage = uiState.errorMessage,
            endpointPreview = "$userPart@$hostPart:$portPart",
        ),
        actions = SshConnectionFormActions(
            onBack = onBack,
            onNameChanged = onNameChanged,
            onHostChanged = onHostChanged,
            onPortChanged = onPortChanged,
            onUserChanged = onUserChanged,
            onAuthModeChanged = onAuthModeChanged,
            onCredentialSelected = onCredentialSelected,
            onImportedKeyChanged = onImportedKeyChanged,
            onPasswordChanged = onPasswordChanged,
            onCredentialNameChanged = onCredentialNameChanged,
            onColorSelected = onColorSelected,
            onIconSelected = onIconSelected,
            onTrustChanged = onTrustChanged,
            onTest = onTest,
            onSave = onSave,
            onDeleteCredential = onDeleteCredential,
        ),
    )
}
