package harold.android.database.session

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
abstract class AgentDao {
    @Query("SELECT * FROM agents WHERE connectionId = :connectionId ORDER BY position")
    abstract fun observeByOrigin(connectionId: String): Flow<List<AgentEntity>>

    @Query("SELECT * FROM agents WHERE connectionId = :connectionId ORDER BY position")
    abstract suspend fun agents(connectionId: String): List<AgentEntity>

    @Upsert
    abstract suspend fun upsertAll(agents: List<AgentEntity>)

    @Query("DELETE FROM agents WHERE connectionId = :connectionId")
    abstract suspend fun deleteByOrigin(connectionId: String)

    @Transaction
    open suspend fun replaceByOrigin(
        connectionId: String,
        agents: List<AgentEntity>,
    ) {
        deleteByOrigin(connectionId)
        upsertAll(agents)
    }
}
