package harold.android.session

import harold.android.contracts.SessionState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

enum class HaroldConnectionStatus {
    Connecting,
    Connected,
    Unreachable,
    Closed,
}

data class HaroldConnection(
    val serverOrigin: String,
    val status: HaroldConnectionStatus,
)

fun interface HaroldReachability {
    suspend fun check(serverOrigin: String): Result<Unit>
}

/**
 * One live link per saved Harold. A link uses that Harold's device credential
 * because authenticated requests look the credential up by server origin.
 */
interface HaroldConnections {
    val connections: StateFlow<List<HaroldConnection>>

    fun onForeground()

    fun onBackground()

    suspend fun refresh()

    fun setSessionStates(serverOrigin: String, states: List<SessionState>)

    fun shouldStayConnected(serverOrigin: String): Boolean
}

/** Used when a caller has no connection roster. Production supplies the real one. */
object InactiveHaroldConnections : HaroldConnections {
    override val connections: StateFlow<List<HaroldConnection>> =
        MutableStateFlow(emptyList())

    override fun onForeground() = Unit

    override fun onBackground() = Unit

    override suspend fun refresh() = Unit

    override fun setSessionStates(serverOrigin: String, states: List<SessionState>) = Unit

    override fun shouldStayConnected(serverOrigin: String): Boolean = false
}
