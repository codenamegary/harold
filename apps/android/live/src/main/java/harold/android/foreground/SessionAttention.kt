package harold.android.foreground

import harold.android.contracts.PermissionRequest
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class MarkedPermission(
    val rowId: String,
    val sessionId: String,
    val sessionName: String,
    val haroldIconId: String,
    val request: PermissionRequest,
)

interface SessionAttentionMarks {
    val marked: StateFlow<Map<String, MarkedPermission>>

    fun mark(permission: MarkedPermission)

    fun clear(rowId: String)
}

@Singleton
class DefaultSessionAttentionMarks @Inject constructor() : SessionAttentionMarks {
    private val _marked = MutableStateFlow<Map<String, MarkedPermission>>(emptyMap())
    override val marked: StateFlow<Map<String, MarkedPermission>> = _marked.asStateFlow()

    override fun mark(permission: MarkedPermission) {
        _marked.value = _marked.value + (permission.rowId to permission)
    }

    override fun clear(rowId: String) {
        _marked.value = _marked.value - rowId
    }
}

interface PermissionAttentionNotifier {
    fun show(alert: PermissionNotification)

    fun clear(sessionId: String)
}
