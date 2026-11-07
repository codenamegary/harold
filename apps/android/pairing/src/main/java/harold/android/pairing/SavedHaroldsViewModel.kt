package harold.android.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.HaroldTransport
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.forgetSavedHarold
import harold.android.credentials.settleAfterForget
import harold.android.live.SessionOwner
import harold.android.navigation.Navigator
import harold.android.session.HaroldConnection
import harold.android.session.HaroldConnectionStatus
import harold.android.session.HaroldConnections
import harold.android.session.SessionGateway
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SavedHaroldRow(
    val serverOrigin: String,
    val endpoint: String = serverOrigin,
    val deviceId: String,
    val name: String,
    val colorId: String,
    val iconId: String,
    val transport: HaroldTransport = HaroldTransport.Server,
    val status: HaroldConnectionStatus = HaroldConnectionStatus.Closed,
)

data class SavedHaroldsUiState(
    val rows: List<SavedHaroldRow> = emptyList(),
    val editingOrigin: String? = null,
    val name: String = "",
    val colorId: String = "",
    val iconId: String = "",
)

@HiltViewModel
class SavedHaroldsViewModel @Inject constructor(
    private val repository: SavedHaroldRepository,
    private val userRepository: UserRepository,
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val navigator: Navigator,
    private val connections: HaroldConnections,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SavedHaroldsUiState())
    val uiState: StateFlow<SavedHaroldsUiState> = _uiState.asStateFlow()

    private var saved: List<SavedHaroldRow> = emptyList()

    init {
        viewModelScope.launch { reload() }
        viewModelScope.launch {
            connections.connections.collect { links -> applyLinks(links) }
        }
        viewModelScope.launch { connections.refresh() }
    }

    fun startEdit(serverOrigin: String) {
        val row = _uiState.value.rows.find { item -> item.serverOrigin == serverOrigin } ?: return
        _uiState.update { current ->
            current.copy(
                editingOrigin = row.serverOrigin,
                name = row.name,
                colorId = row.colorId,
                iconId = row.iconId,
            )
        }
    }

    fun saveEdit() {
        val state = _uiState.value
        val origin = state.editingOrigin ?: return
        if (state.name.isBlank()) {
            return
        }
        viewModelScope.launch {
            repository.edit(
                serverOrigin = origin,
                name = state.name.trim(),
                colorId = state.colorId,
                iconId = state.iconId,
            )
            cancelEdit()
            reload()
        }
    }

    fun remove(serverOrigin: String) {
        val row = _uiState.value.rows.find { item -> item.serverOrigin == serverOrigin } ?: return
        viewModelScope.launch {
            val remains = forgetSavedHarold(
                serverOrigin = row.serverOrigin,
                deviceId = row.deviceId,
                revoke = userRepository::revokeDevice,
                repository = repository,
            )
            settleAfterForget(
                removedOrigin = row.serverOrigin,
                remains = remains,
                gateway = sessionGateway,
                disconnect = sessionOwner::disconnect,
                connect = sessionOwner::connect,
                showPairing = {
                    navigator.showShell()
                    navigator.openAddConnection()
                },
            )
            connections.refresh()
            reload()
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

    fun cancelEdit() {
        _uiState.update { current ->
            current.copy(
                editingOrigin = null,
                name = "",
                colorId = "",
                iconId = "",
            )
        }
    }

    private suspend fun reload() {
        saved = repository.list().map { harold ->
            SavedHaroldRow(
                serverOrigin = harold.serverOrigin,
                endpoint = harold.displayEndpoint,
                deviceId = harold.deviceId,
                name = harold.name,
                colorId = harold.colorId,
                iconId = harold.iconId,
                transport = harold.transport,
            )
        }
        _uiState.update { current -> current.copy(rows = saved) }
        applyLinks(connections.connections.value)
    }

    private fun applyLinks(links: List<HaroldConnection>) {
        val byOrigin = links.associateBy { link -> link.serverOrigin }
        val rows = saved.map { row ->
            row.copy(status = byOrigin[row.serverOrigin]?.status ?: HaroldConnectionStatus.Closed)
        }
        _uiState.update { current -> current.copy(rows = rows) }
    }
}
