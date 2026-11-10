package harold.android.database

import android.content.Context
import androidx.room.Room
import androidx.room.withTransaction
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import harold.android.database.session.AgentDao
import harold.android.database.session.AgentRepository
import harold.android.database.session.DefaultAgentRepository
import harold.android.database.session.DefaultSessionRepository
import harold.android.database.session.DefaultSessionWorktreePathStore
import harold.android.database.session.SessionRepository
import harold.android.database.session.SessionWorktreePathDao
import harold.android.database.session.SessionWorktreePathStore
import harold.android.database.workspace.DefaultWorkspaceRepository
import harold.android.database.workspace.WorkspaceDao
import harold.android.database.workspace.WorkspaceRepository
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DatabaseModule {
    @Binds
    @Singleton
    abstract fun sessionRepository(impl: DefaultSessionRepository): SessionRepository

    @Binds
    @Singleton
    abstract fun agentRepository(impl: DefaultAgentRepository): AgentRepository

    @Binds
    @Singleton
    abstract fun sessionWorktreePathStore(
        impl: DefaultSessionWorktreePathStore,
    ): SessionWorktreePathStore

    @Binds
    @Singleton
    abstract fun workspaceRepository(impl: DefaultWorkspaceRepository): WorkspaceRepository

    companion object {
        @Provides
        @Singleton
        fun database(
            @ApplicationContext context: Context,
        ): HaroldDatabase = Room.databaseBuilder(
            context,
            HaroldDatabase::class.java,
            "connection.db",
        )
            .fallbackToDestructiveMigration(dropAllTables = true)
            .build()

        @Provides
        fun workspaceDao(database: HaroldDatabase): WorkspaceDao = database.workspaceDao()

        @Provides
        fun worktreePathDao(database: HaroldDatabase): SessionWorktreePathDao =
            database.sessionWorktreePathDao()

        @Provides
        fun agentDao(database: HaroldDatabase): AgentDao = database.agentDao()

        @Provides
        @Singleton
        fun localCacheCleaner(
            database: HaroldDatabase,
            workspaceDao: WorkspaceDao,
            worktreePathDao: SessionWorktreePathDao,
            agentDao: AgentDao,
        ): LocalCacheCleaner = RoomLocalCacheCleaner(
            database = database,
            workspaceDao = workspaceDao,
            worktreePathDao = worktreePathDao,
            agentDao = agentDao,
        )
    }
}

class RoomLocalCacheCleaner(
    private val database: HaroldDatabase,
    private val workspaceDao: WorkspaceDao,
    private val worktreePathDao: SessionWorktreePathDao,
    private val agentDao: AgentDao,
) : LocalCacheCleaner {
    override suspend fun deleteByOrigin(connectionId: String) {
        database.withTransaction {
            workspaceDao.deleteByOrigin(connectionId)
            worktreePathDao.deleteByOrigin(connectionId)
            agentDao.deleteByOrigin(connectionId)
        }
    }
}
