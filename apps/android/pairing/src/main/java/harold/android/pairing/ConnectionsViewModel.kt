package harold.android.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.forgetConnection
import harold.android.credentials.settleAfterForget
import harold.android.live.SessionOwner
import harold.android.navigation.Navigator
import harold.android.session.ConnectionHealth
import harold.android.session.ConnectionStatus
import harold.android.session.Connections
import harold.android.session.SessionGateway
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConnectionRow(
    val connectionId: String,
    val endpoint: String = connectionId,
    val name: String,
    val colorId: String,
    val iconId: String,
    val status: ConnectionStatus = ConnectionStatus.Closed,
)

data class ConnectionsUiState(
    val rows: List<ConnectionRow> = emptyList(),
    val editingOrigin: String? = null,
    val name: String = "",
    val colorId: String = "",
    val iconId: String = "",
)

@HiltViewModel
class ConnectionsViewModel @Inject constructor(
    private val repository: ConnectionRepository,
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val navigator: Navigator,
    private val connections: Connections,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ConnectionsUiState())
    val uiState: StateFlow<ConnectionsUiState> = _uiState.asStateFlow()

    private var saved: List<ConnectionRow> = emptyList()

    init {
        viewModelScope.launch { reload() }
        viewModelScope.launch {
            connections.connections.collect { links -> applyLinks(links) }
        }
        viewModelScope.launch { connections.refresh() }
    }

    fun startEdit(connectionId: String) {
        val row = _uiState.value.rows.find { item -> item.connectionId == connectionId } ?: return
        _uiState.update { current ->
            current.copy(
                editingOrigin = row.connectionId,
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
                connectionId = origin,
                name = state.name.trim(),
                colorId = state.colorId,
                iconId = state.iconId,
            )
            cancelEdit()
            reload()
        }
    }

    fun remove(connectionId: String) {
        val row = _uiState.value.rows.find { item -> item.connectionId == connectionId } ?: return
        viewModelScope.launch {
            val remains = forgetConnection(
                connectionId = row.connectionId,
                repository = repository,
            )
            settleAfterForget(
                removedConnectionId = row.connectionId,
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
        saved = repository.list().map { connection ->
            ConnectionRow(
                connectionId = connection.connectionId,
                endpoint = connection.displayEndpoint,
                name = connection.name,
                colorId = connection.colorId,
                iconId = connection.iconId,
            )
        }
        _uiState.update { current -> current.copy(rows = saved) }
        applyLinks(connections.connections.value)
    }

    private fun applyLinks(links: List<ConnectionHealth>) {
        val byOrigin = links.associateBy { link -> link.connectionId }
        val rows = saved.map { row ->
            row.copy(status = byOrigin[row.connectionId]?.status ?: ConnectionStatus.Closed)
        }
        _uiState.update { current -> current.copy(rows = rows) }
    }
}
