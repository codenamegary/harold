package harold.android.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import harold.android.credentials.ConnectionStore

class DefaultSessionGateway(
    private val credentialStore: ConnectionStore,
    private val connections: Connections = InactiveConnections,
) : SessionGateway {
    private val _pairedState = MutableStateFlow<PairedState>(PairedState.NotPaired)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    override suspend fun refresh() {
        val stored = credentialStore.list().firstOrNull()
        _pairedState.value = if (stored == null) {
            PairedState.NotPaired
        } else {
            PairedState.Paired(
                connectionId = stored.connectionId,
                deviceName = stored.deviceName,
            )
        }
        connections.refresh()
    }

    override suspend fun clearLocalAccess() {
        credentialStore.clear()
        _pairedState.value = PairedState.NotPaired
        connections.refresh()
    }
}
