package harold.android.live

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentId
import harold.android.contracts.AvailableCommand
import harold.android.contracts.ConfigOption
import harold.android.contracts.PermissionRequest

/** The session the stream is pointed at. */
data class WatchTarget(
    val agentId: AgentId,
    val sessionId: String,
)

data class SessionSnapshot(
    val agentId: AgentId? = null,
    val sessionId: String? = null,
    val transcript: AcpTranscriptState = emptyAcpTranscript,
    val reconnecting: Boolean = false,
    val availableCommands: List<AvailableCommand> = emptyList(),
    val configOptions: List<ConfigOption> = emptyList(),
    val pendingPermission: PermissionRequest? = null,
    /** Pending agent questions, oldest first, deduplicated by requestId. */
    val pendingElicitations: List<Elicitation> = emptyList(),
    /** URL requests accepted locally and waiting for `elicitation_completed`. */
    val urlElicitationsAwaitingCompletion: List<Elicitation.Url> = emptyList(),
    val completedElicitationIds: Set<String> = emptySet(),
    val extension: StreamExtension? = null,
    val agentAuth: AgentAuth? = null,
    val authRequired: Boolean = false,
    val worktreePath: String? = null,
    /** True once a `session_worktree_path` event supplied [worktreePath]. */
    val worktreePathKnown: Boolean = false,
)
