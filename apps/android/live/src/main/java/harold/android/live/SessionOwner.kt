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
     * Marks the start of a background period. The next [onForeground] can
     * compare the stream's last frame time to tell a surviving socket from
     * one frozen through Doze.
     */
    fun onBackground()

    /**
     * A cheap resume check. If the watched stream received nothing while
     * backgrounded, it is closed and reopened immediately. A stream that
     * received a heartbeat or frame is left alone.
     */
    fun onForeground()

    /**
     * Drain the inbox, empty the live snapshot, then subscribe when
     * [sessionId] is a real session. Null or blank [sessionId] means no session yet.
     */
    fun watch(agentId: AgentId?, sessionId: String?)

    /**
     * Sends the prompt over REST. When the transcript is not yet live (the
     * stream has not delivered `subscribed`), the prompt is held and posted
     * once it is; the returned result reports acceptance, not delivery.
     */
    suspend fun prompt(
        text: String,
        attachments: List<AttachmentReference> = emptyList(),
    ): Result<Unit>

    /** Posts a cancel for the watched session. */
    suspend fun cancel(): Result<Unit>

    /** Posts a permission reply and clears the pending permission optimistically. */
    suspend fun replyPermission(requestId: String, optionId: String): Result<Unit>

    /** Posts an extension reply and clears the pending extension optimistically. */
    suspend fun replyExtension(requestId: String, result: JsonElement): Result<Unit>

    /**
     * Seeds a session's config selectors from data the client already has (the
     * create response) so they render before the stream delivers a frame.
     */
    fun rememberConfig(agentId: AgentId, sessionId: String, configOptions: List<ConfigOption>)

    fun forget(agentId: AgentId, sessionId: String)
}
