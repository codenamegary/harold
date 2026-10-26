package harold.android.database

import androidx.room.Room
import harold.android.database.session.AgentEntity
import harold.android.database.session.SessionEntity
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
        database.sessionDao().upsertAll(
            listOf(session(ORIGIN), session(OTHER_ORIGIN)),
        )
        database.agentDao().upsertAll(
            listOf(agent(ORIGIN), agent(OTHER_ORIGIN)),
        )
        val cleaner = RoomLocalCacheCleaner(
            database = database,
            workspaceDao = database.workspaceDao(),
            sessionDao = database.sessionDao(),
            agentDao = database.agentDao(),
        )

        cleaner.deleteByOrigin(ORIGIN)

        assertEquals(
            listOf(OTHER_ORIGIN),
            database.workspaceDao().observeAll().first().map { row -> row.serverOrigin },
        )
        assertEquals(
            listOf(OTHER_ORIGIN),
            database.sessionDao().observeAll().first().map { row -> row.serverOrigin },
        )
        assertEquals(
            listOf(OTHER_ORIGIN),
            database.agentDao().observeByOrigin(OTHER_ORIGIN).first().map { row -> row.serverOrigin },
        )
    }

    private fun workspace(origin: String) = WorkspaceEntity(
        serverOrigin = origin,
        id = "ws_01",
        name = "harold",
        path = "/tmp/harold",
        state = "Available",
        createdAt = "2026-08-01T00:00:00.000Z",
        lastUsedAt = "2026-08-01T00:00:00.000Z",
        position = 0,
    )

    private fun session(origin: String) = SessionEntity(
        serverOrigin = origin,
        agentId = "cursor",
        sessionId = "sess_01",
        cwd = "/tmp/harold",
        title = "Alpha",
        updatedAt = "2026-08-01T00:00:00.000Z",
        workspaceId = "ws_01",
        workspaceName = "harold",
        agentLabel = "Cursor",
    )

    private fun agent(origin: String) = AgentEntity(
        serverOrigin = origin,
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
