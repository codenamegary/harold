package harold.android.workspaces.data

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
abstract class WorkspaceDao {
    @Query("SELECT * FROM workspaces ORDER BY serverOrigin, position")
    abstract fun observeAll(): Flow<List<WorkspaceEntity>>

    @Query("SELECT * FROM workspaces WHERE serverOrigin = :serverOrigin ORDER BY position")
    abstract fun observeByOrigin(serverOrigin: String): Flow<List<WorkspaceEntity>>

    @Upsert
    abstract suspend fun upsertAll(workspaces: List<WorkspaceEntity>)

    @Query("SELECT COUNT(*) FROM workspaces WHERE serverOrigin = :serverOrigin")
    abstract suspend fun countByOrigin(serverOrigin: String): Int

    @Query("DELETE FROM workspaces WHERE serverOrigin = :serverOrigin AND id = :id")
    abstract suspend fun delete(
        serverOrigin: String,
        id: String,
    )

    @Query("DELETE FROM workspaces WHERE serverOrigin = :serverOrigin")
    abstract suspend fun deleteByOrigin(serverOrigin: String)

    @Transaction
    open suspend fun replaceByOrigin(
        serverOrigin: String,
        workspaces: List<WorkspaceEntity>,
    ) {
        deleteByOrigin(serverOrigin)
        upsertAll(workspaces)
    }
}
