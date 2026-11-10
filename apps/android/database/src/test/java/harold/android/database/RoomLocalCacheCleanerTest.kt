package harold.android.database

import androidx.room.Room
import harold.android.database.session.AgentEntity
import harold.android.database.session.SessionWorktreePathEntity
import harold.android.database.workspace.WorkspaceEntity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class RoomLocalCacheCleanerTest {
    private lateinit var database: HaroldDatabase

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            RuntimeEnvironment.getApplication(),
            HaroldDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun removesCachedRowsForOneHaroldAndLeavesTheOthers() = runTest {
        database.workspaceDao().upsertAll(
            listOf(workspace(ORIGIN), workspace(OTHER_ORIGIN)),
        )
        database.sessionWorktreePathDao().upsert(worktreePath(ORIGIN))
        database.sessionWorktreePathDao().upsert(worktreePath(OTHER_ORIGIN))
        database.agentDao().upsertAll(
            listOf(agent(ORIGIN), agent(OTHER_ORIGIN)),
        )
        val cleaner = RoomLocalCacheCleaner(
            database = database,
            workspaceDao = database.workspaceDao(),
            worktreePathDao = database.sessionWorktreePathDao(),
            agentDao = database.agentDao(),
        )

        cleaner.deleteByOrigin(ORIGIN)

        assertEquals(
            listOf(OTHER_ORIGIN),
            database.workspaceDao().observeAll().first().map { row -> row.connectionId },
        )
        assertEquals(
            listOf(OTHER_ORIGIN),
            database.sessionWorktreePathDao().observeAll().first().map { row -> row.connectionId },
        )
        assertEquals(
            listOf(OTHER_ORIGIN),
            database.agentDao().observeByOrigin(OTHER_ORIGIN).first().map { row -> row.connectionId },
        )
    }

    private fun workspace(origin: String) = WorkspaceEntity(
        connectionId = origin,
        id = "ws_01",
        name = "harold",
        path = "/tmp/harold",
        state = "Available",
        createdAt = "2026-08-01T00:00:00.000Z",
        lastUsedAt = "2026-08-01T00:00:00.000Z",
        position = 0,
    )

    private fun worktreePath(origin: String) = SessionWorktreePathEntity(
        connectionId = origin,
        agentId = "cursor",
        sessionId = "sess_01",
        worktreePath = "/repo/.worktrees/feat-x",
    )

    private fun agent(origin: String) = AgentEntity(
        connectionId = origin,
        agentId = "cursor",
        displayName = "Cursor",
        available = true,
        enabled = true,
        path = null,
        position = 0,
    )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
        const val OTHER_ORIGIN = "http://127.0.0.2:8787"
    }
}
