package harold.android.database.session

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import harold.android.contracts.AgentId
import kotlinx.coroutines.flow.Flow

@Dao
abstract class SessionWorktreePathDao {
    @Query("SELECT * FROM session_worktree_paths")
    abstract fun observeAll(): Flow<List<SessionWorktreePathEntity>>

    @Upsert
    abstract suspend fun upsert(row: SessionWorktreePathEntity)

    @Query(
        "DELETE FROM session_worktree_paths WHERE connectionId = :connectionId " +
            "AND agentId = :agentId AND sessionId = :sessionId",
    )
    abstract suspend fun delete(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    )

    @Query("DELETE FROM session_worktree_paths WHERE connectionId = :connectionId")
    abstract suspend fun deleteByOrigin(connectionId: String)
}
