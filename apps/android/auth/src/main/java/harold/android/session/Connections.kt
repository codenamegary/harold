package harold.android.session

import harold.android.contracts.SessionState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

enum class ConnectionStatus {
    Connecting,
    Connected,
    Unreachable,
    Closed,
}

data class ConnectionHealth(
    val connectionId: String,
    val status: ConnectionStatus,
)

fun interface ConnectionReachability {
    suspend fun check(connectionId: String): Result<Unit>
}

/**
 * One live link per saved connection, keyed by that connection id.
 */
interface Connections {
    val connections: StateFlow<List<ConnectionHealth>>

    fun onForeground()

    fun onBackground()

    suspend fun refresh()

    fun setSessionStates(connectionId: String, states: List<SessionState>)

    fun shouldStayConnected(connectionId: String): Boolean
}

/** Used when a caller has no connection roster. Production supplies the real one. */
object InactiveConnections : Connections {
    override val connections: StateFlow<List<ConnectionHealth>> =
        MutableStateFlow(emptyList())

    override fun onForeground() = Unit

    override fun onBackground() = Unit

    override suspend fun refresh() = Unit

    override fun setSessionStates(connectionId: String, states: List<SessionState>) = Unit

    override fun shouldStayConnected(connectionId: String): Boolean = false
}
