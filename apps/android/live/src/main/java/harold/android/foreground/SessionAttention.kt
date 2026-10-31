package harold.android.foreground

import harold.android.contracts.PermissionRequest
import harold.android.live.Elicitation
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What kind of user input a session is waiting for. A session with both a
 * permission and a question is "input": the strongest label wins.
 */
enum class UserInputKind {
    Permission,
    Question,
    Input,
}

fun userInputKind(
    hasPermission: Boolean,
    hasQuestion: Boolean,
): UserInputKind? = when {
    hasPermission && hasQuestion -> UserInputKind.Input
    hasPermission -> UserInputKind.Permission
    hasQuestion -> UserInputKind.Question
    else -> null
}

data class MarkedUserInput(
    val rowId: String,
    val sessionId: String,
    val sessionName: String,
    val haroldIconId: String,
    val request: PermissionRequest? = null,
    val elicitation: Elicitation? = null,
)

typealias MarkedPermission = MarkedUserInput

interface SessionAttentionMarks {
    val marked: StateFlow<Map<String, MarkedUserInput>>

    fun mark(permission: MarkedUserInput)

    fun clear(rowId: String)
}

@Singleton
class DefaultSessionAttentionMarks @Inject constructor() : SessionAttentionMarks {
    private val _marked = MutableStateFlow<Map<String, MarkedUserInput>>(emptyMap())
    override val marked: StateFlow<Map<String, MarkedUserInput>> = _marked.asStateFlow()

    override fun mark(permission: MarkedUserInput) {
        _marked.value = _marked.value + (permission.rowId to permission)
    }

    override fun clear(rowId: String) {
        _marked.value = _marked.value - rowId
    }
}

interface UserInputAttentionNotifier {
    fun show(alert: UserInputNotification)

    fun clear(sessionId: String)
}

typealias PermissionAttentionNotifier = UserInputAttentionNotifier
