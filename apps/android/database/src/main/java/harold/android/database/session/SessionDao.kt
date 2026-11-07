package harold.android.database.session

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import harold.android.contracts.AgentId
import kotlinx.coroutines.flow.Flow

@Dao
abstract class SessionDao {
    @Query("SELECT * FROM sessions ORDER BY updatedAt DESC")
    abstract fun observeAll(): Flow<List<SessionEntity>>

    @Query(
        "SELECT * FROM sessions WHERE connectionId = :connectionId ORDER BY updatedAt DESC",
    )
    abstract fun observeByOrigin(connectionId: String): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE connectionId = :connectionId")
    abstract suspend fun sessions(connectionId: String): List<SessionEntity>

    @Upsert
    abstract suspend fun upsertAll(sessions: List<SessionEntity>)

    @Query(
        "DELETE FROM sessions WHERE connectionId = :connectionId " +
            "AND agentId = :agentId AND sessionId = :sessionId",
    )
    abstract suspend fun delete(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    )

    @Query(
        "UPDATE sessions SET worktreePath = :worktreePath " +
            "WHERE connectionId = :connectionId " +
            "AND agentId = :agentId AND sessionId = :sessionId " +
            "AND (worktreePath IS NOT :worktreePath)",
    )
    abstract suspend fun updateWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ): Int

    @Query("DELETE FROM sessions WHERE connectionId = :connectionId")
    abstract suspend fun deleteByOrigin(connectionId: String)

    @Transaction
    open suspend fun replaceByOrigin(
        connectionId: String,
        sessions: List<SessionEntity>,
    ) {
        deleteByOrigin(connectionId)
        upsertAll(sessions)
    }
}
