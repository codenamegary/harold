package harold.android.testing

import harold.android.session.PairedState
import harold.android.session.SessionGateway
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class FakeSessionGateway(
    initial: PairedState = PairedState.NotPaired,
) : SessionGateway {
    private val _pairedState = MutableStateFlow(initial)
    override val pairedState: StateFlow<PairedState> = _pairedState.asStateFlow()

    var clearLocalAccessCount: Int = 0
        private set

    var pairedAfterRefresh: PairedState? = null

    override suspend fun refresh() {
        pairedAfterRefresh?.let { next -> _pairedState.value = next }
    }

    override suspend fun clearLocalAccess() {
        clearLocalAccessCount += 1
        _pairedState.value = PairedState.NotPaired
    }
}
