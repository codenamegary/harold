package harold.android.database.session

import androidx.room.Entity
import harold.android.contracts.AgentId

/**
 * App-local memory of the worktree a session is reviewed in. ACP knows nothing
 * about worktrees, so this never leaves the phone and is stored separately
 * from the live session catalog.
 */
@Entity(
    tableName = "session_worktree_paths",
    primaryKeys = ["connectionId", "agentId", "sessionId"],
)
data class SessionWorktreePathEntity(
    val connectionId: String,
    val agentId: AgentId,
    val sessionId: String,
    val worktreePath: String,
)
