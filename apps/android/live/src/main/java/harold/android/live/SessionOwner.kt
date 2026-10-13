package harold.android.live

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonElement
import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentReference
import harold.android.contracts.ConfigOption
import harold.android.stream.ConnectionState

/**
 * Process-scoped owner of the session stream. Chat reads [snapshot] and
 * never sees a raw frame. Shell uses [connectionState] plus connect/retry.
 */
interface SessionOwner {
    val connectionState: StateFlow<ConnectionState>

    val snapshot: StateFlow<SessionSnapshot>

    /**
     * Latest agent-pushed titles keyed by [harold.android.contracts.catalogSessionKey],
     * covering every session the stream reported a rename for. Survives watch
     * changes so session lists can follow renames.
     */
    val sessionTitles: StateFlow<Map<String, String>>

    /** Emits after each prompt_complete frame for the watched session. */
    val promptCompletions: Flow<Unit>

    fun connect(serverOrigin: String)

    fun retry()

    fun disconnect()

    /**
     * Drain the inbox, empty the live snapshot, then subscribe when
     * [sessionId] is a real session. Null or blank [sessionId] means no session yet.
     */
    fun watch(agentId: AgentId?, sessionId: String?)

    fun prompt(text: String, attachments: List<AttachmentReference> = emptyList())

    fun cancel()

    fun replyPermission(requestId: String, optionId: String)

    fun replyExtension(requestId: String, result: JsonElement)

    /**
     * Seeds a session's config selectors from data the client already has (the
     * create response) so they render before the stream delivers a frame.
     */
    fun rememberConfig(agentId: AgentId, sessionId: String, configOptions: List<ConfigOption>)

    fun forget(agentId: AgentId, sessionId: String)
}
