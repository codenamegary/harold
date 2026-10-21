package harold.android.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import harold.android.credentials.CredentialHolder
import harold.android.credentials.CredentialStore

class DefaultSessionGateway(
    private val credentialStore: CredentialStore,
    private val credentialHolder: CredentialHolder = CredentialHolder(),
    private val connections: HaroldConnections = InactiveHaroldConnections,
) : SessionGateway {
    private val _pairedState = MutableStateFlow<PairedState>(PairedState.NotPaired)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    override suspend fun refresh() {
        val saved = credentialStore.list()

        credentialHolder.publish(
            saved.associate { harold -> harold.serverOrigin to harold.credential },
        )

        val stored = saved.firstOrNull()
        _pairedState.value = if (stored == null) {
            PairedState.NotPaired
        } else {
            PairedState.Paired(
                serverOrigin = stored.serverOrigin,
                deviceId = stored.deviceId,
                deviceName = stored.deviceName,
                )
        }
        connections.refresh()
    }

    override suspend fun clearLocalAccess() {
        credentialStore.clear()
        credentialHolder.clear()
        _pairedState.value = PairedState.NotPaired
        connections.refresh()
    }
}
