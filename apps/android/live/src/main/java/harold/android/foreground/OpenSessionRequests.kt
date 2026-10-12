package harold.android.foreground

import javax.inject.Inject
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Delivers notification-tap session targets into the chat workflow without
 * duplicating navigation state when that session is already selected.
 */
interface OpenSessionRequests {
    val sessionIds: SharedFlow<String>

    fun open(sessionId: String)
}

class DefaultOpenSessionRequests @Inject constructor() : OpenSessionRequests {
    private val _sessionIds = MutableSharedFlow<String>(extraBufferCapacity = 1)
    override val sessionIds: SharedFlow<String> = _sessionIds.asSharedFlow()

    override fun open(sessionId: String) {
        _sessionIds.tryEmit(sessionId)
    }
}
