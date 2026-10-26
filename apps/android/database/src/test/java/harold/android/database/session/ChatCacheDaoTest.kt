package harold.android.database.session

import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import harold.android.database.workspace.WorkspaceDao
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
class ChatCacheDaoTest {
    private lateinit var database: TestChatDatabase
    private lateinit var sessionDao: SessionDao
    private lateinit var agentDao: AgentDao

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            RuntimeEnvironment.getApplication(),
            TestChatDatabase::class.java,
        ).allowMainThreadQueries().build()
        sessionDao = database.sessionDao()
        agentDao = database.agentDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun sessionsAreKeptApartByOriginAndAgent() = runTest {
        sessionDao.upsertAll(
            listOf(
                session(origin = "http://laptop:3847", agentId = "cursor", sessionId = "sess_01", title = "laptop"),
                session(origin = "http://desktop:3847", agentId = "cursor", sessionId = "sess_01", title = "desktop"),
                session(origin = "http://laptop:3847", agentId = "claude", sessionId = "sess_01", title = "claude"),
            ),
        )

        assertEquals(3, sessionDao.observeAll().first().size)
        assertEquals(
            listOf("laptop"),
            sessionDao.observeByOrigin("http://laptop:3847")
                .first()
                .filter { session -> session.agentId == "cursor" }
                .map { session -> session.title },
        )
    }

    @Test
    fun replaceByOriginDropsRowsTheServerNoLongerLists() = runTest {
        sessionDao.upsertAll(
            listOf(
                session(sessionId = "sess_old", title = "old"),
                session(sessionId = "sess_keep", title = "keep"),
            ),
        )

        sessionDao.replaceByOrigin(
            serverOrigin = ORIGIN,
            sessions = listOf(session(sessionId = "sess_new", title = "new")),
        )

        assertEquals(
            listOf("sess_new"),
            sessionDao.observeAll().first().map { session -> session.sessionId },
        )
    }

    @Test
    fun deleteRemovesOneSessionAndLeavesTheRest() = runTest {
        sessionDao.upsertAll(
            listOf(
                session(sessionId = "sess_01", title = "one"),
                session(sessionId = "sess_02", title = "two"),
            ),
        )

        sessionDao.delete(ORIGIN, "cursor", "sess_01")

        assertEquals(
            listOf("sess_02"),
            sessionDao.observeAll().first().map { session -> session.sessionId },
        )
    }

    @Test
    fun agentsReplaceByOriginAndKeepServerOrder() = runTest {
        agentDao.replaceByOrigin(
            serverOrigin = ORIGIN,
            agents = listOf(
                agent("claude", "Claude", position = 0),
                agent("cursor", "Cursor", position = 1),
            ),
        )
        agentDao.replaceByOrigin(
            serverOrigin = ORIGIN,
            agents = listOf(
                agent("cursor", "Cursor", position = 0),
                agent("claude", "Claude", position = 1),
                agent("codex", "Codex", position = 2),
            ),
        )

        assertEquals(
            listOf("cursor", "claude", "codex"),
            agentDao.observeByOrigin(ORIGIN).first().map { agent -> agent.agentId },
        )
    }

    @Test
    fun deleteByOriginClearsOnlyThatHarold() = runTest {
        sessionDao.upsertAll(
            listOf(
                session(origin = "http://laptop:3847", title = "laptop"),
                session(origin = "http://desktop:3847", title = "desktop"),
            ),
        )
        agentDao.upsertAll(
            listOf(
                agent(agentId = "cursor", serverOrigin = "http://laptop:3847"),
                agent(agentId = "cursor", serverOrigin = "http://desktop:3847"),
            ),
        )

        sessionDao.deleteByOrigin("http://laptop:3847")
        agentDao.deleteByOrigin("http://laptop:3847")

        assertEquals(
            listOf("http://desktop:3847"),
            sessionDao.observeAll().first().map { session -> session.serverOrigin },
        )
        assertEquals(
            listOf("http://desktop:3847"),
            agentDao.observeByOrigin("http://desktop:3847").first().map { agent -> agent.serverOrigin },
        )
    }

    private fun session(
        origin: String = ORIGIN,
        agentId: String = "cursor",
        sessionId: String = "sess_01",
        title: String = "Alpha",
    ) = SessionEntity(
        serverOrigin = origin,
        agentId = agentId,
        sessionId = sessionId,
        cwd = "/tmp/harold",
        title = title,
        updatedAt = "2026-08-01T00:00:00.000Z",
        workspaceId = "ws_01",
        workspaceName = "harold",
        agentLabel = agentId,
    )

    private fun agent(
        agentId: String = "cursor",
        displayName: String = "Cursor",
        serverOrigin: String = ORIGIN,
        position: Int = 0,
    ) = AgentEntity(
        serverOrigin = serverOrigin,
        agentId = agentId,
        displayName = displayName,
        available = true,
        enabled = true,
        path = null,
        position = position,
    )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

@Database(
    entities = [SessionEntity::class, AgentEntity::class, WorkspaceEntity::class],
    version = 1,
    exportSchema = false,
)
internal abstract class TestChatDatabase : RoomDatabase() {
    abstract fun sessionDao(): SessionDao

    abstract fun agentDao(): AgentDao

    abstract fun workspaceDao(): WorkspaceDao
}
