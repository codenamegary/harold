package harold.android.database.session

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
abstract class AgentDao {
    @Query("SELECT * FROM agents WHERE serverOrigin = :serverOrigin ORDER BY position")
    abstract fun observeByOrigin(serverOrigin: String): Flow<List<AgentEntity>>

    @Query("SELECT * FROM agents WHERE serverOrigin = :serverOrigin ORDER BY position")
    abstract suspend fun agents(serverOrigin: String): List<AgentEntity>

    @Upsert
    abstract suspend fun upsertAll(agents: List<AgentEntity>)

    @Query("DELETE FROM agents WHERE serverOrigin = :serverOrigin")
    abstract suspend fun deleteByOrigin(serverOrigin: String)

    @Transaction
    open suspend fun replaceByOrigin(
        serverOrigin: String,
        agents: List<AgentEntity>,
    ) {
        deleteByOrigin(serverOrigin)
        upsertAll(agents)
    }
}
