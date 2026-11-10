package harold.android.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import harold.android.credentials.ConnectionStore

class DefaultConnectionGateway(
    private val credentialStore: ConnectionStore,
    private val connections: Connections = InactiveConnections,
) : ConnectionGateway {
    private val _activeConnection = MutableStateFlow<ActiveConnectionState>(ActiveConnectionState.NoConnection)
    override val activeConnection: StateFlow<ActiveConnectionState> = _activeConnection.asStateFlow()

    override suspend fun refresh() {
        val stored = credentialStore.list().firstOrNull()
        _activeConnection.value = if (stored == null) {
            ActiveConnectionState.NoConnection
        } else {
            ActiveConnectionState.Active(
                connectionId = stored.connectionId,
                deviceName = stored.deviceName,
            )
        }
        connections.refresh()
    }

    override suspend fun clearLocalAccess() {
        credentialStore.clear()
        _activeConnection.value = ActiveConnectionState.NoConnection
        connections.refresh()
    }
}
