package harold.android.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshCredential
import harold.android.credentials.SshCredentialStore
import harold.android.credentials.forgetConnection
import harold.android.credentials.settleAfterForget
import harold.android.live.SessionOwner
import harold.android.navigation.Navigator
import harold.android.session.SessionGateway
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConnectionSettingsUiState(
    val connectionId: String = "",
    val name: String = "",
    val endpoint: String = "",
    val host: String = "",
    val port: String = "",
    val user: String = "",
    val fingerprint: String = "",
    val authSummary: String = "",
    /** Saved credentials the user can switch to; the current auth is excluded. */
    val credentials: List<SshCredential> = emptyList(),
    val selectedCredentialId: String? = null,
    val colorId: String = "",
    val iconId: String = "",
    val defaultAgentOptions: List<AgentOptionUi> = emptyList(),
    val defaultAgentId: String? = null,
    val defaultWorkspacePath: String = "",
    val loaded: Boolean = false,
    val saved: Boolean = false,
    val forgetConfirmVisible: Boolean = false,
    val error: String? = null,
)

data class AgentOptionUi(
    val id: String,
    val displayName: String,
)

@HiltViewModel
class ConnectionSettingsViewModel @Inject constructor(
    private val repository: ConnectionRepository,
    private val credentialStore: SshCredentialStore,
    private val userRepository: UserRepository,
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val navigator: Navigator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ConnectionSettingsUiState())
    val uiState: StateFlow<ConnectionSettingsUiState> = _uiState.asStateFlow()

    private var startedKey: String? = null

    private var connectionId: String = ""

    /** Called once per route instance from the nav entry. */
    fun start(connectionId: String) {
        if (startedKey == connectionId) {
            return
        }
        startedKey = connectionId
        this.connectionId = connectionId
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val connection = repository.find(connectionId)
            if (connection == null) {
                _uiState.update { current -> current.copy(error = "This connection is gone.") }
                return@launch
            }
            val credentials = credentialStore.list()
            _uiState.update { current ->
                current.copy(
                    connectionId = connection.connectionId,
                    name = connection.name,
                    endpoint = connection.displayEndpoint,
                    host = connection.ssh.host,
                    port = connection.ssh.port.toString(),
                    user = connection.ssh.user,
                    fingerprint = connection.ssh.hostKeyFingerprint,
                    authSummary = authSummary(connection.ssh.auth),
                    credentials = credentials,
                    selectedCredentialId = null,
                    colorId = connection.colorId,
                    iconId = connection.iconId,
                    defaultAgentId = connection.defaultAgentId,
                    defaultWorkspacePath = connection.defaultWorkspacePath.orEmpty(),
                    loaded = true,
                    error = null,
                )
            }
            loadDefaultAgents()
        }
    }

    fun onNameChanged(value: String) {
        _uiState.update { current -> current.copy(name = value) }
    }

    fun onColorSelected(colorId: String) {
        _uiState.update { current -> current.copy(colorId = colorId) }
    }

    fun onIconSelected(iconId: String) {
        _uiState.update { current -> current.copy(iconId = iconId) }
    }

    fun onDefaultAgentSelected(agentId: String?) {
        _uiState.update { current -> current.copy(defaultAgentId = agentId) }
    }

    fun onDefaultWorkspaceChanged(value: String) {
        _uiState.update { current -> current.copy(defaultWorkspacePath = value) }
    }

    fun onCredentialSelected(credentialId: String?) {
        _uiState.update { current -> current.copy(selectedCredentialId = credentialId) }
    }

    fun save() {
        val state = _uiState.value
        viewModelScope.launch {
            val connection = repository.find(connectionId) ?: return@launch
            val selectedCredential = state.selectedCredentialId
                ?.let { id -> state.credentials.find { it.id == id } }
            val updatedAuth = selectedCredential?.toAuth() ?: connection.ssh.auth
            repository.save(
                connection.copy(
                    name = state.name.trim().ifBlank { connection.name },
                    colorId = state.colorId,
                    iconId = state.iconId,
                    defaultAgentId = state.defaultAgentId,
                    defaultWorkspacePath = state.defaultWorkspacePath.trim()
                        .takeIf { it.isNotBlank() },
                    ssh = connection.ssh.copy(auth = updatedAuth),
                ),
            )
            _uiState.update { current ->
                current.copy(
                    saved = true,
                    name = state.name.trim().ifBlank { connection.name },
                    authSummary = authSummary(updatedAuth),
                    selectedCredentialId = null,
                )
            }
        }
    }

    fun clearSavedNotice() {
        _uiState.update { current -> current.copy(saved = false) }
    }

    fun showForgetConfirm() {
        _uiState.update { current -> current.copy(forgetConfirmVisible = true) }
    }

    fun hideForgetConfirm() {
        _uiState.update { current -> current.copy(forgetConfirmVisible = false) }
    }

    fun forget() {
        viewModelScope.launch {
            val remains = forgetConnection(
                connectionId = connectionId,
                repository = repository,
            )
            hideForgetConfirm()
            settleAfterForget(
                removedConnectionId = connectionId,
                remains = remains,
                gateway = sessionGateway,
                disconnect = sessionOwner::disconnect,
                connect = sessionOwner::connect,
                showPairing = {
                    navigator.showShell()
                    navigator.openAddConnection()
                },
            )
            navigator.goBack()
        }
    }

    fun goBack() {
        navigator.goBack()
    }

    private suspend fun loadDefaultAgents() {
        userRepository.listAgents(connectionId).fold(
            onSuccess = { collection ->
                val options = collection.items
                    .filter { agent -> agent.enabled && !agent.dismissed }
                    .map { agent -> AgentOptionUi(agent.id, agent.displayName) }
                _uiState.update { current ->
                    current.copy(
                        defaultAgentOptions = options,
                        defaultAgentId = current.defaultAgentId
                            ?.takeIf { id -> options.any { it.id == id } },
                    )
                }
            },
            onFailure = { },
        )
    }

    private fun authSummary(auth: SshAuth): String = when (auth) {
        is SshAuth.PrivateKey -> "Private key on this phone"
        is SshAuth.Password -> "Password stored on this phone"
    }
}
