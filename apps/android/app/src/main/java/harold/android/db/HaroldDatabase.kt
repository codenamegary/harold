package harold.android.db

import androidx.room.Database
import androidx.room.RoomDatabase
import harold.android.chat.data.AgentDao
import harold.android.chat.data.AgentEntity
import harold.android.chat.data.SessionDao
import harold.android.chat.data.SessionEntity
import harold.android.workspaces.data.WorkspaceDao
import harold.android.workspaces.data.WorkspaceEntity

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
