package server.agent.android.connection

import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage
import server.agent.android.events.ConnectionState

/**
 * Process-scoped owner of the single `/v1/sessions/stream` socket while paired.
 * Keep-alive presence and chat subscribe/switch/prompt share that socket.
 */
interface ConnectionGateway {
    val state: StateFlow<ConnectionState>

    /** Session-stream frames for the current target (and any other server messages). */
    val messages: SharedFlow<SessionStreamServerMessage>

    /** Fires after a reconnect, before subscribe is resent, so chat can clear local turn state. */
    val streamResets: SharedFlow<Unit>

    /** Starts (or restarts) the keep-alive stream loop. */
    fun connect(serverOrigin: String)

    /** Operator-driven restart after a terminal auth or contract failure. */
    fun retry()

    fun disconnect()

    fun send(message: SessionStreamClientMessage)

    fun setTarget(agentId: AgentId?, sessionId: String?)
}
