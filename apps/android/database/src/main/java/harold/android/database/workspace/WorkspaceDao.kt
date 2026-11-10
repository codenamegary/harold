package harold.android.database.workspace

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
abstract class WorkspaceDao {
    @Query("SELECT * FROM workspaces ORDER BY connectionId, position")
    abstract fun observeAll(): Flow<List<WorkspaceEntity>>

    @Query("SELECT * FROM workspaces WHERE connectionId = :connectionId ORDER BY position")
    abstract fun observeByOrigin(connectionId: String): Flow<List<WorkspaceEntity>>

    @Upsert
    abstract suspend fun upsertAll(workspaces: List<WorkspaceEntity>)

    @Query("SELECT COUNT(*) FROM workspaces WHERE connectionId = :connectionId")
    abstract suspend fun countByOrigin(connectionId: String): Int

    @Query("DELETE FROM workspaces WHERE connectionId = :connectionId AND id = :id")
    abstract suspend fun delete(
        connectionId: String,
        id: String,
    )

    @Query("DELETE FROM workspaces WHERE connectionId = :connectionId AND path = :path")
    abstract suspend fun deleteByPath(
        connectionId: String,
        path: String,
    )

    @Query("DELETE FROM workspaces WHERE connectionId = :connectionId")
    abstract suspend fun deleteByOrigin(connectionId: String)

    @Transaction
    open suspend fun replaceByOrigin(
        connectionId: String,
        workspaces: List<WorkspaceEntity>,
    ) {
        deleteByOrigin(connectionId)
        upsertAll(workspaces)
    }
}
