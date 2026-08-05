package server.agent.android.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import server.agent.android.credentials.CredentialStore

class DefaultSessionGateway(
    private val credentialStore: CredentialStore,
) : SessionGateway {
    private val _pairedState = MutableStateFlow<PairedState>(PairedState.NotPaired)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    override suspend fun refresh() {
        val stored = credentialStore.load()

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
}
