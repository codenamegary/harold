package harold.android.db

import android.content.Context
import androidx.room.Room
import androidx.room.withTransaction
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import harold.android.cache.LocalCacheCleaner
import harold.android.chat.data.AgentDao
import harold.android.chat.data.SessionDao
import harold.android.workspaces.data.WorkspaceDao
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun database(
        @ApplicationContext context: Context,
    ): HaroldDatabase = Room.databaseBuilder(
        context,
        HaroldDatabase::class.java,
        "harold.db",
    ).build()

    @Provides
    fun workspaceDao(database: HaroldDatabase): WorkspaceDao = database.workspaceDao()

    @Provides
    fun sessionDao(database: HaroldDatabase): SessionDao = database.sessionDao()

    @Provides
    fun agentDao(database: HaroldDatabase): AgentDao = database.agentDao()

    @Provides
    @Singleton
    fun localCacheCleaner(
        database: HaroldDatabase,
        workspaceDao: WorkspaceDao,
        sessionDao: SessionDao,
        agentDao: AgentDao,
    ): LocalCacheCleaner = RoomLocalCacheCleaner(
        database = database,
        workspaceDao = workspaceDao,
        sessionDao = sessionDao,
        agentDao = agentDao,
    )
}

class RoomLocalCacheCleaner(
    private val database: HaroldDatabase,
    private val workspaceDao: WorkspaceDao,
    private val sessionDao: SessionDao,
    private val agentDao: AgentDao,
) : LocalCacheCleaner {
    override suspend fun deleteByOrigin(serverOrigin: String) {
        database.withTransaction {
            workspaceDao.deleteByOrigin(serverOrigin)
            sessionDao.deleteByOrigin(serverOrigin)
            agentDao.deleteByOrigin(serverOrigin)
        }
    }
}
