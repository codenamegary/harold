package harold.android.database

import androidx.room.Database
import androidx.room.RoomDatabase
import harold.android.database.session.AgentDao
import harold.android.database.session.AgentEntity
import harold.android.database.session.SessionDao
import harold.android.database.session.SessionEntity
import harold.android.database.workspace.WorkspaceDao
import harold.android.database.workspace.WorkspaceEntity

@Database(
    entities = [
        WorkspaceEntity::class,
        SessionEntity::class,
        AgentEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class HaroldDatabase : RoomDatabase() {
    abstract fun workspaceDao(): WorkspaceDao

    abstract fun sessionDao(): SessionDao

    abstract fun agentDao(): AgentDao
}
