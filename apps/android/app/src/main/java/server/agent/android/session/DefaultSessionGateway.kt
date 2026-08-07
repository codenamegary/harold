package server.agent.android.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import server.agent.android.credentials.CredentialHolder
import server.agent.android.credentials.CredentialStore

class DefaultSessionGateway(
    private val credentialStore: CredentialStore,
    private val credentialHolder: CredentialHolder = CredentialHolder(),
) : SessionGateway {
    private val _pairedState = MutableStateFlow<PairedState>(PairedState.NotPaired)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    override suspend fun refresh() {
        val stored = credentialStore.load()

        credentialHolder.set(stored?.credential)

        _pairedState.value = if (stored == null) {
            PairedState.NotPaired
        } else {
            PairedState.Paired(
                serverOrigin = stored.serverOrigin,
                deviceId = stored.deviceId,
                deviceName = stored.deviceName,
            )
        }
    }

    override suspend fun clearLocalAccess() {
        credentialStore.clear()
        credentialHolder.set(null)
        _pairedState.value = PairedState.NotPaired
    }
}
