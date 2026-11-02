package harold.android.database

import android.content.Context
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class SessionWorktreePathMigrationTest {
    private val context: Context = RuntimeEnvironment.getApplication()
    private val databaseName = "session-worktree-path-migration.db"

    @Before
    fun setUp() {
        context.deleteDatabase(databaseName)
    }

    @After
    fun tearDown() {
        context.deleteDatabase(databaseName)
    }

    @Test
    fun migrationAddsANullableWorktreePathColumnAndKeepsRows() {
        val versionOne = openDatabase(version = 1)
        versionOne.writableDatabase.execSQL(
            """
            INSERT INTO sessions (
              serverOrigin, agentId, sessionId, cwd, title, updatedAt,
              workspaceId, workspaceName, agentLabel
            ) VALUES (
              'http://127.0.0.1:8787', 'cursor', 'sess_01', '/repo', 'Fix it',
              '2026-11-02T00:00:00.000Z', 'ws_01', 'harold', 'Cursor'
            )
            """.trimIndent(),
        )
        versionOne.close()

        val versionTwo = openDatabase(version = 2) { database, _, _ ->
            MIGRATION_1_2.migrate(database)
        }
        val database = versionTwo.writableDatabase
        database.query("SELECT worktreePath FROM sessions").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertTrue(cursor.isNull(0))
        }

        database.execSQL(
            "UPDATE sessions SET worktreePath = '/repo/.worktrees/feat-x' WHERE sessionId = 'sess_01'",
        )
        database.query("SELECT worktreePath FROM sessions").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("/repo/.worktrees/feat-x", cursor.getString(0))
        }
        versionTwo.close()
    }

    private fun openDatabase(
        version: Int,
        onUpgrade: (SupportSQLiteDatabase, Int, Int) -> Unit = { _, _, _ -> },
    ): SupportSQLiteOpenHelper = FrameworkSQLiteOpenHelperFactory().create(
        SupportSQLiteOpenHelper.Configuration.builder(context)
            .name(databaseName)
            .callback(
                object : SupportSQLiteOpenHelper.Callback(version) {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        db.execSQL(
                            """
                            CREATE TABLE sessions (
                              serverOrigin TEXT NOT NULL,
                              agentId TEXT NOT NULL,
                              sessionId TEXT NOT NULL,
                              cwd TEXT NOT NULL,
                              title TEXT NOT NULL,
                              updatedAt TEXT NOT NULL,
                              workspaceId TEXT NOT NULL,
                              workspaceName TEXT NOT NULL,
                              agentLabel TEXT NOT NULL,
                              PRIMARY KEY(serverOrigin, agentId, sessionId)
                            )
                            """.trimIndent(),
                        )
                    }

                    override fun onUpgrade(
                        db: SupportSQLiteDatabase,
                        oldVersion: Int,
                        newVersion: Int,
                    ) {
                        onUpgrade(db, oldVersion, newVersion)
                    }
                },
            )
            .build(),
    )
}
