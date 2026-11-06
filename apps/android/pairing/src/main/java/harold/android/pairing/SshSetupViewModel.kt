package harold.android.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.HaroldTransport
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.StoredCredential
import harold.android.navigation.Navigator
import harold.android.session.SessionGateway
import harold.android.transport.ssh.GeneratedSshKey
import harold.android.transport.ssh.SshEnrollment
import harold.android.transport.ssh.SshKeyGenerator
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
    val testedFingerprint: String? = null,
    val trusted: Boolean = false,
    val testing: Boolean = false,
    val saving: Boolean = false,
    val errorMessage: String? = null,
) {
    val publicKey: String? get() = generatedKey?.publicKey
    val canTest: Boolean
        get() = host.isNotBlank() && port.toIntOrNull() != null && user.isNotBlank() &&
            when (authMode) {
                SshAuthMode.GeneratedKey -> generatedKey != null
                SshAuthMode.ImportedKey -> importedKey.isNotBlank()
                SshAuthMode.Password -> password.isNotBlank()
            }
    val canSave: Boolean get() = canTest && testedFingerprint != null && trusted && !saving
}

@HiltViewModel
class SshSetupViewModel @Inject constructor(
    private val repository: SavedHaroldRepository,
    private val gateway: SessionGateway,
    private val enrollment: SshEnrollment,
    private val navigator: Navigator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        SshSetupUiState(generatedKey = pendingKey()),
    )
    val uiState: StateFlow<SshSetupUiState> = _uiState.asStateFlow()

    fun onHostChanged(value: String) {
        _uiState.update { state ->
            state.copy(
                host = value.trim(),
                name = if (state.name.isBlank() || state.name == suggestedName(state.host)) {
                    suggestedName(value.trim())
                } else {
                    state.name
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
            state.copy(
                authMode = mode,
                testedFingerprint = null,
                trusted = false,
                errorMessage = null,
            )
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
        val config = state.toConfig() ?: return
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
        val config = state.toConfig() ?: return
        val fingerprint = state.testedFingerprint ?: return
        if (!state.canSave) {
            return
        }
        _uiState.update { current -> current.copy(saving = true, errorMessage = null) }
        viewModelScope.launch {
            val saved = StoredCredential(
                formatVersion = FORMAT_VERSION,
                deviceId = fingerprint,
                serverOrigin = config.connectionId,
                deviceName = config.host,
                credential = "",
                name = state.name.trim().ifBlank { suggestedName(config.host) },
                colorId = state.colorId,
                iconId = state.iconId,
                transport = HaroldTransport.Ssh,
                ssh = config.copy(hostKeyFingerprint = fingerprint),
            )
            repository.save(saved)
            gateway.refresh()
            _uiState.update { current -> current.copy(saving = false) }
            navigator.showChat()
        }
    }

    fun onBack() {
        navigator.goBack()
    }

    companion object {
        private const val FORMAT_VERSION = 2

        // Keep one phone key across setup-screen recreations. The key only
        // becomes durable when the connection is saved.
        private var pendingKeyValue: GeneratedSshKey? = null

        private fun pendingKey(): GeneratedSshKey =
            pendingKeyValue ?: SshKeyGenerator.generate().also { key ->
                pendingKeyValue = key
            }

        fun suggestedName(host: String): String =
            host.substringBefore('.').ifBlank { "ssh" }

        private fun SshSetupUiState.toConfig(): SshConfig? {
            val portNumber = port.toIntOrNull() ?: return null
            if (host.isBlank() || user.isBlank()) {
                return null
            }
            val auth = when (authMode) {
                SshAuthMode.GeneratedKey -> {
                    val key = generatedKey ?: return null
                    SshAuth.PrivateKey(pem = key.privateKeyPem, publicKey = key.publicKey)
                }
                SshAuthMode.ImportedKey -> SshAuth.PrivateKey(
                    pem = importedKey.trim(),
                    publicKey = "",
                )
                SshAuthMode.Password -> SshAuth.Password(secret = password)
            }
            return SshConfig(
                host = host,
                port = portNumber,
                user = user,
                auth = auth,
                hostKeyFingerprint = "",
            )
        }
    }
}
