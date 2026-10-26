package harold.android.database.workspace

import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
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
class WorkspaceDaoTest {
    private lateinit var database: TestWorkspaceDatabase
    private lateinit var dao: WorkspaceDao

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            RuntimeEnvironment.getApplication(),
            TestWorkspaceDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = database.workspaceDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun compositeKeyKeepsTheSameWorkspaceIdSeparatePerOrigin() = runTest {
        dao.upsertAll(
            listOf(
                workspace(origin = "http://laptop:3847", name = "laptop"),
                workspace(origin = "http://desktop:3847", name = "desktop"),
            ),
        )

        assertEquals(
            listOf("laptop"),
            dao.observeByOrigin("http://laptop:3847").first().map { workspace -> workspace.name },
        )
        assertEquals(
            listOf("desktop"),
            dao.observeByOrigin("http://desktop:3847").first().map { workspace -> workspace.name },
        )
        assertEquals(2, dao.observeAll().first().size)
    }

    @Test
    fun upsertUpdatesTheSameRow() = runTest {
        dao.upsertAll(listOf(workspace(name = "before")))
        dao.upsertAll(listOf(workspace(name = "after")))

        val saved = dao.observeAll().first().single()
        assertEquals("after", saved.name)
    }

    @Test
    fun replaceByOriginDropsRowsTheServerNoLongerLists() = runTest {
        dao.upsertAll(
            listOf(
                workspace(id = "ws_old", name = "old"),
                workspace(id = "ws_keep", name = "keep"),
            ),
        )

        dao.replaceByOrigin(
            serverOrigin = ORIGIN,
            workspaces = listOf(workspace(id = "ws_new", name = "new", position = 0)),
        )

        assertEquals(listOf("ws_new"), dao.observeByOrigin(ORIGIN).first().map { row -> row.id })
    }

    private fun workspace(
        origin: String = ORIGIN,
        id: String = "ws_01",
        name: String = "harold",
        position: Int = 0,
    ) = WorkspaceEntity(
        serverOrigin = origin,
        id = id,
        name = name,
        path = "/tmp/harold",
        state = "Available",
        createdAt = "2026-08-01T00:00:00.000Z",
        lastUsedAt = "2026-08-01T00:00:00.000Z",
        position = position,
    )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

@Database(entities = [WorkspaceEntity::class], version = 1, exportSchema = false)
internal abstract class TestWorkspaceDatabase : RoomDatabase() {
    abstract fun workspaceDao(): WorkspaceDao
}
