package harold.android.chat.data

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
        "SELECT * FROM sessions WHERE serverOrigin = :serverOrigin ORDER BY updatedAt DESC",
    )
    abstract fun observeByOrigin(serverOrigin: String): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE serverOrigin = :serverOrigin")
    abstract suspend fun sessions(serverOrigin: String): List<SessionEntity>

    @Upsert
    abstract suspend fun upsertAll(sessions: List<SessionEntity>)

    @Query(
        "DELETE FROM sessions WHERE serverOrigin = :serverOrigin " +
            "AND agentId = :agentId AND sessionId = :sessionId",
    )
    abstract suspend fun delete(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    )

    @Query("DELETE FROM sessions WHERE serverOrigin = :serverOrigin")
    abstract suspend fun deleteByOrigin(serverOrigin: String)

    @Transaction
    open suspend fun replaceByOrigin(
        serverOrigin: String,
        sessions: List<SessionEntity>,
    ) {
        deleteByOrigin(serverOrigin)
        upsertAll(sessions)
    }
}
