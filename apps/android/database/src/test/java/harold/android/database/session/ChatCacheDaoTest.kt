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
import org.junit.Assert.assertNull
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
    private lateinit var worktreePathDao: SessionWorktreePathDao
    private lateinit var agentDao: AgentDao

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            RuntimeEnvironment.getApplication(),
            TestChatDatabase::class.java,
        ).allowMainThreadQueries().build()
        worktreePathDao = database.sessionWorktreePathDao()
        agentDao = database.agentDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun worktreePathsAreKeptApartByOriginAndAgent() = runTest {
        worktreePathDao.upsert(
            worktreePath(origin = "http://laptop:3847", agentId = "cursor", sessionId = "sess_01", path = "/a"),
        )
        worktreePathDao.upsert(
            worktreePath(origin = "http://desktop:3847", agentId = "cursor", sessionId = "sess_01", path = "/b"),
        )
        worktreePathDao.upsert(
            worktreePath(origin = "http://laptop:3847", agentId = "claude", sessionId = "sess_01", path = "/c"),
        )

        assertEquals(3, worktreePathDao.observeAll().first().size)
        assertEquals(
            listOf("/a"),
            worktreePathDao.observeAll()
                .first()
                .filter { row -> row.connectionId == "http://laptop:3847" && row.agentId == "cursor" }
                .map { row -> row.worktreePath },
        )
    }

    @Test
    fun worktreePathIsUpdatedAndClearedForOneSession() = runTest {
        worktreePathDao.upsert(worktreePath(sessionId = "sess_01", path = "/old"))
        worktreePathDao.upsert(worktreePath(sessionId = "sess_02", path = "/keep"))

        worktreePathDao.upsert(worktreePath(sessionId = "sess_01", path = "/new"))

        assertEquals(
            "/new",
            worktreePathDao.observeAll().first()
                .first { row -> row.sessionId == "sess_01" }
                .worktreePath,
        )

        worktreePathDao.delete(ORIGIN, "cursor", "sess_01")
        worktreePathDao.delete(ORIGIN, "cursor", "sess_02")

        assertEquals(0, worktreePathDao.observeAll().first().size)
    }

    @Test
    fun deleteByOriginClearsOnlyThatConnection() = runTest {
        worktreePathDao.upsert(worktreePath(origin = "http://laptop:3847"))
        worktreePathDao.upsert(worktreePath(origin = "http://desktop:3847"))

        worktreePathDao.deleteByOrigin("http://laptop:3847")

        assertEquals(
            listOf("http://desktop:3847"),
            worktreePathDao.observeAll().first().map { row -> row.connectionId },
        )
    }

    @Test
    fun agentsReplaceByOriginAndKeepServerOrder() = runTest {
        agentDao.replaceByOrigin(
            connectionId = ORIGIN,
            agents = listOf(
                agent("claude", "Claude", position = 0),
                agent("cursor", "Cursor", position = 1),
            ),
        )
        agentDao.replaceByOrigin(
            connectionId = ORIGIN,
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
        worktreePathDao.upsert(worktreePath(origin = "http://laptop:3847"))
        worktreePathDao.upsert(worktreePath(origin = "http://desktop:3847"))
        agentDao.upsertAll(
            listOf(
                agent(agentId = "cursor", connectionId = "http://laptop:3847"),
                agent(agentId = "cursor", connectionId = "http://desktop:3847"),
            ),
        )

        worktreePathDao.deleteByOrigin("http://laptop:3847")
        agentDao.deleteByOrigin("http://laptop:3847")

        assertEquals(
            listOf("http://desktop:3847"),
            worktreePathDao.observeAll().first().map { row -> row.connectionId },
        )
        assertEquals(
            listOf("http://desktop:3847"),
            agentDao.observeByOrigin("http://desktop:3847").first().map { agent -> agent.connectionId },
        )
    }

    @Test
    fun missingWorktreePathReadsAsNull() = runTest {
        assertNull(worktreePathDao.observeAll().first().firstOrNull())
    }

    private fun worktreePath(
        origin: String = ORIGIN,
        agentId: String = "cursor",
        sessionId: String = "sess_01",
        path: String = "/repo/.worktrees/feat-x",
    ) = SessionWorktreePathEntity(
        connectionId = origin,
        agentId = agentId,
        sessionId = sessionId,
        worktreePath = path,
    )

    private fun agent(
        agentId: String = "cursor",
        displayName: String = "Cursor",
        connectionId: String = ORIGIN,
        position: Int = 0,
    ) = AgentEntity(
        connectionId = connectionId,
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
    entities = [SessionWorktreePathEntity::class, AgentEntity::class, WorkspaceEntity::class],
    version = 1,
    exportSchema = false,
)
internal abstract class TestChatDatabase : RoomDatabase() {
    abstract fun sessionWorktreePathDao(): SessionWorktreePathDao

    abstract fun agentDao(): AgentDao

    abstract fun workspaceDao(): WorkspaceDao
}
