package server.agent.android.live

import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonElement
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AttachmentReference
import server.agent.android.events.ConnectionState

/**
 * Process-scoped owner of the session stream. Chat reads [snapshot] and
 * never sees a raw frame. Shell uses [connectionState] plus connect/retry.
 */
interface SessionOwner {
    val connectionState: StateFlow<ConnectionState>

    val snapshot: StateFlow<SessionSnapshot>

    fun connect(serverOrigin: String)

    fun retry()

    fun disconnect()

    /**
     * Drain the inbox, empty the live snapshot, then subscribe when
     * [sessionId] is a real session. Null or blank [sessionId] is a draft.
     */
    fun watch(agentId: AgentId?, sessionId: String?)

    fun prompt(text: String, attachments: List<AttachmentReference> = emptyList())

    fun cancel()

    fun replyPermission(requestId: String, optionId: String)

    fun replyExtension(requestId: String, result: JsonElement)

    fun forget(agentId: AgentId, sessionId: String)
}
