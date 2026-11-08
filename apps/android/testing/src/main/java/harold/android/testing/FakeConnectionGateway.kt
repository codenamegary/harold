package harold.android.testing

import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class FakeConnectionGateway(
    initial: ActiveConnectionState = ActiveConnectionState.NoConnection,
) : ConnectionGateway {
    private val _activeConnection = MutableStateFlow(initial)
    override val activeConnection: StateFlow<ActiveConnectionState> = _activeConnection.asStateFlow()

    var clearLocalAccessCount: Int = 0
        private set

    var activeAfterRefresh: ActiveConnectionState? = null

    override suspend fun refresh() {
        activeAfterRefresh?.let { next -> _activeConnection.value = next }
    }

    override suspend fun clearLocalAccess() {
        clearLocalAccessCount += 1
        _activeConnection.value = ActiveConnectionState.NoConnection
    }
}
