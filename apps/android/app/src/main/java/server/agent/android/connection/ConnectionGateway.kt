package server.agent.android.connection

import kotlinx.coroutines.flow.StateFlow
import server.agent.android.events.ConnectionState

interface ConnectionGateway {
    val state: StateFlow<ConnectionState>

    /** Starts (or restarts) the stream loop, resuming from the applied cursor. */
    fun connect(serverOrigin: String)

    /** Operator-driven restart after a terminal auth or contract failure. */
    fun retry()

    fun disconnect()
}
