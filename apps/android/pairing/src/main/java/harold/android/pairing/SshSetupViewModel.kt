package harold.android.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.SshCredential
import harold.android.credentials.SshCredentialKind
import harold.android.credentials.SshCredentialStore
import harold.android.credentials.StoredCredential
import harold.android.navigation.Navigator
import harold.android.session.SessionGateway
import harold.android.transport.ssh.GeneratedSshKey
import harold.android.transport.ssh.SshProbe
import harold.android.transport.ssh.SshKeyGenerator
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SshAuthMode {
    GeneratedKey,
    ImportedKey,
    Password,
}

data class SavedSshCredential(
    val id: String,
    val name: String,
    val kind: SshCredentialKind,
    val publicKey: String? = null,
)

data class SshSetupUiState(
    val host: String = "",
    val port: String = "22",
    val user: String = "",
    val name: String = "",
    val authMode: SshAuthMode = SshAuthMode.GeneratedKey,
    val generatedKey: GeneratedSshKey? = null,
    val importedKey: String = "",
    val password: String = "",
    val colorId: String = "tide",
    val iconId: String = "terminal",
    val savedCredentials: List<SavedSshCredential> = emptyList(),
    val selectedCredentialId: String? = null,
    val credentialName: String = defaultCredentialName(SshAuthMode.GeneratedKey),
    val saveCredentialForReuse: Boolean = true,
    val testedFingerprint: String? = null,
    val trusted: Boolean = false,
    val testing: Boolean = false,
    val saving: Boolean = false,
    val errorMessage: String? = null,
) {
    val selectedCredential: SavedSshCredential?
        get() = savedCredentials.find { credential -> credential.id == selectedCredentialId }

    val publicKey: String?
        get() = selectedCredential?.publicKey ?: generatedKey?.publicKey

    val canTest: Boolean
        get() = host.isNotBlank() && port.toIntOrNull() != null && user.isNotBlank() &&
            if (selectedCredentialId != null) {
                selectedCredential != null
            } else {
                when (authMode) {
                    SshAuthMode.GeneratedKey -> generatedKey != null
                    SshAuthMode.ImportedKey -> importedKey.isNotBlank()
                    SshAuthMode.Password -> password.isNotBlank()
                }
            }

    val canSave: Boolean get() = canTest && testedFingerprint != null && trusted && !saving
}

@HiltViewModel
class SshSetupViewModel @Inject constructor(
    private val repository: SavedHaroldRepository,
    private val gateway: SessionGateway,
    private val enrollment: SshProbe,
    private val navigator: Navigator,
    private val credentials: SshCredentialStore,
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        SshSetupUiState(generatedKey = pendingKey()),
    )
    val uiState: StateFlow<SshSetupUiState> = _uiState.asStateFlow()

    private var loadedCredentials: List<SshCredential> = emptyList()

    init {
        viewModelScope.launch { reloadCredentials() }
    }

    fun onHostChanged(value: String) {
        _uiState.update { state ->
            state.copy(
                host = value.trim(),
                name = if (state.name.isBlank() || state.name == suggestedName(state.host)) {
                    suggestedName(value.trim())
                } else {
                    state.name
                },
                credentialName = if (
                    state.credentialName.isBlank() ||
                    state.credentialName == defaultCredentialName(state.authMode, state.host)
                ) {
                    defaultCredentialName(state.authMode, value.trim())
                } else {
                    state.credentialName
                },
                testedFingerprint = null,
                trusted = false,
            )
        }
    }

    fun onPortChanged(value: String) {
        if (value.all { character -> character.isDigit() } && value.length <= 5) {
            _uiState.update { state ->
                state.copy(port = value, testedFingerprint = null, trusted = false)
            }
        }
    }

    fun onUserChanged(value: String) {
        _uiState.update { state ->
            state.copy(user = value.trim(), testedFingerprint = null, trusted = false)
        }
    }

    fun onNameChanged(value: String) {
        _uiState.update { state -> state.copy(name = value) }
    }

    fun onAuthModeChanged(mode: SshAuthMode) {
        _uiState.update { state ->
            val nextName = if (
                state.credentialName.isBlank() ||
                state.credentialName == defaultCredentialName(state.authMode, state.host)
            ) {
                defaultCredentialName(mode, state.host)
            } else {
                state.credentialName
            }
            state.copy(
                authMode = mode,
                credentialName = nextName,
                testedFingerprint = null,
                trusted = false,
                errorMessage = null,
            )
        }
    }

    fun onCredentialSelected(id: String?) {
        _uiState.update { state ->
            state.copy(
                selectedCredentialId = id,
                credentialName = if (state.credentialName.isBlank()) {
                    defaultCredentialName(state.authMode, state.host)
                } else {
                    state.credentialName
                },
                testedFingerprint = null,
                trusted = false,
                errorMessage = null,
            )
        }
    }

    fun onCredentialNameChanged(value: String) {
        _uiState.update { state -> state.copy(credentialName = value) }
    }

    fun onSaveCredentialForReuseChanged(value: Boolean) {
        _uiState.update { state -> state.copy(saveCredentialForReuse = value) }
    }

    fun onDeleteCredential(id: String) {
        viewModelScope.launch {
            credentials.remove(id)
            reloadCredentials()
        }
    }

    fun onImportedKeyChanged(value: String) {
        _uiState.update { state ->
            state.copy(importedKey = value, testedFingerprint = null, trusted = false)
        }
    }

    fun onPasswordChanged(value: String) {
        _uiState.update { state ->
            state.copy(password = value, testedFingerprint = null, trusted = false)
        }
    }

    fun onColorSelected(colorId: String) {
        _uiState.update { state -> state.copy(colorId = colorId) }
    }

    fun onIconSelected(iconId: String) {
        _uiState.update { state -> state.copy(iconId = iconId) }
    }

    fun onTrustChanged(trusted: Boolean) {
        _uiState.update { state -> state.copy(trusted = trusted) }
    }

    fun testConnection() {
        val state = _uiState.value
        val config = buildConfig() ?: return
        if (!state.canTest || state.testing) {
            return
        }
        _uiState.update { current ->
            current.copy(testing = true, errorMessage = null, testedFingerprint = null, trusted = false)
        }
        viewModelScope.launch {
            enrollment.probe(config).fold(
                onSuccess = { fingerprint ->
                    _uiState.update { current ->
                        current.copy(
                            testing = false,
                            testedFingerprint = fingerprint,
                            trusted = false,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            testing = false,
                            errorMessage = error.message ?: "Could not connect to the SSH host.",
                        )
                    }
                },
            )
        }
    }

    fun save() {
        val state = _uiState.value
        val config = buildConfig() ?: return
        val fingerprint = state.testedFingerprint ?: return
        if (!state.canSave) {
            return
        }
        _uiState.update { current -> current.copy(saving = true, errorMessage = null) }
        viewModelScope.launch {
            val savedCredential = if (state.selectedCredentialId == null && state.saveCredentialForReuse) {
                val credential = buildCredential(state, config.auth)
                runCatching { credentials.save(credential) }.onFailure { error ->
                    _uiState.update { current ->
                        current.copy(
                            saving = false,
                            errorMessage = error.message ?: "Could not save the SSH credential.",
                        )
                    }
                    return@launch
                }
                credential
            } else {
                state.selectedCredentialId?.let { id -> credentials.touch(id) }
                null
            }

            val existing = repository.list()
            val saved = StoredCredential(
                formatVersion = FORMAT_VERSION,
                serverOrigin = uniqueSshOrigin(config.connectionId, existing),
                deviceName = config.host,
                name = unusedName(
                    base = state.name.trim().ifBlank { suggestedName(config.host) },
                    usedNames = existing.map { credential -> credential.name }.toSet(),
                ),
                colorId = state.colorId,
                iconId = state.iconId,
                ssh = config.copy(hostKeyFingerprint = fingerprint),
            )
            repository.save(saved)
            gateway.refresh()
            if (savedCredential?.kind == SshCredentialKind.PrivateKey) {
                pendingKeyValue = null
            }
            _uiState.update { current -> current.copy(saving = false) }
            navigator.showChat()
        }
    }

    fun onBack() {
        navigator.goBack()
    }

    private suspend fun reloadCredentials() {
        val saved = credentials.list()
        loadedCredentials = saved
        _uiState.update { state ->
            val rows = saved.map { credential ->
                SavedSshCredential(
                    id = credential.id,
                    name = credential.name,
                    kind = credential.kind,
                    publicKey = credential.publicKey,
                )
            }
            val selectedStillExists = rows.any { row -> row.id == state.selectedCredentialId }
            state.copy(
                savedCredentials = rows,
                selectedCredentialId = if (selectedStillExists) state.selectedCredentialId else null,
                credentialName = if (state.credentialName.isBlank()) {
                    defaultCredentialName(state.authMode, state.host)
                } else {
                    state.credentialName
                },
            )
        }
    }

    private fun buildCredential(state: SshSetupUiState, auth: SshAuth): SshCredential {
        val defaultName = defaultCredentialName(state.authMode, state.host)
        val name = state.credentialName.trim().ifBlank { defaultName }
        val kind = when (auth) {
            is SshAuth.PrivateKey -> SshCredentialKind.PrivateKey
            is SshAuth.Password -> SshCredentialKind.Password
        }
        val existing = loadedCredentials.find { credential ->
            credential.name.equals(name, ignoreCase = true) && credential.kind == kind
        }
        val now = Instant.now().toString()
        return SshCredential(
            id = existing?.id ?: "sshcred_${UUID.randomUUID()}",
            name = name,
            kind = kind,
            privateKeyPem = (auth as? SshAuth.PrivateKey)?.pem,
            publicKey = (auth as? SshAuth.PrivateKey)?.publicKey,
            password = (auth as? SshAuth.Password)?.secret,
            createdAt = existing?.createdAt ?: now,
            lastUsedAt = now,
        )
    }

    private fun buildConfig(): SshConfig? {
        val state = _uiState.value
        val portNumber = state.port.toIntOrNull() ?: return null
        if (state.host.isBlank() || state.user.isBlank()) {
            return null
        }
        val auth = if (state.selectedCredentialId != null) {
            selectedAuth() ?: return null
        } else {
            when (state.authMode) {
                SshAuthMode.GeneratedKey -> {
                    val key = state.generatedKey ?: return null
                    SshAuth.PrivateKey(pem = key.privateKeyPem, publicKey = key.publicKey)
                }
                SshAuthMode.ImportedKey -> SshAuth.PrivateKey(
                    pem = state.importedKey.trim(),
                    publicKey = "",
                )
                SshAuthMode.Password -> SshAuth.Password(secret = state.password)
            }
        }
        return SshConfig(
            host = state.host,
            port = portNumber,
            user = state.user,
            auth = auth,
            hostKeyFingerprint = "",
        )
    }

    private fun selectedAuth(): SshAuth? =
        loadedCredentials
            .find { credential -> credential.id == _uiState.value.selectedCredentialId }
            ?.toAuth()

    companion object {
        private const val FORMAT_VERSION = 3

        // Keep one phone key across setup-screen recreations. The key only
        // becomes durable when the connection is saved.
        private var pendingKeyValue: GeneratedSshKey? = null

        private fun pendingKey(): GeneratedSshKey =
            pendingKeyValue ?: SshKeyGenerator.generate().also { key ->
                pendingKeyValue = key
            }

        fun suggestedName(host: String): String =
            host.substringBefore('.').ifBlank { "ssh" }
    }
}

fun defaultCredentialName(mode: SshAuthMode, host: String = ""): String {
    val prefix = host.substringBefore('.').ifBlank { "Phone" }
    return when (mode) {
        SshAuthMode.GeneratedKey -> "$prefix SSH key"
        SshAuthMode.ImportedKey -> "$prefix imported key"
        SshAuthMode.Password -> "$prefix SSH password"
    }
}

/**
 * A saved connection is identified by [StoredCredential.serverOrigin]. SSH
 * hosts share that key when they point at the same user, host, and port,
 * so later connections get a stable suffix instead of replacing the first one.
 */
internal fun uniqueSshOrigin(base: String, saved: List<StoredCredential>): String {
    if (saved.none { credential -> credential.serverOrigin == base }) {
        return base
    }
    var suffix = 2
    while (saved.any { credential -> credential.serverOrigin == "$base#$suffix" }) {
        suffix += 1
    }
    return "$base#$suffix"
}

internal fun unusedName(base: String, usedNames: Set<String>): String {
    if (base !in usedNames) {
        return base
    }
    var number = 2
    while ("$base $number" in usedNames) {
        number += 1
    }
    return "$base $number"
}
