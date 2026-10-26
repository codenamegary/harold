package harold.android.database.workspace

import androidx.room.Room
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.PageInfo
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceState
import harold.android.network.AgentApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
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
class DefaultWorkspaceRepositoryTest {
    private lateinit var database: TestWorkspaceDatabase
    private lateinit var api: WorkspaceFakeAgentApi
    private lateinit var repository: DefaultWorkspaceRepository

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            RuntimeEnvironment.getApplication(),
            TestWorkspaceDatabase::class.java,
        ).allowMainThreadQueries().build()
        api = WorkspaceFakeAgentApi()
        repository = DefaultWorkspaceRepository(api, database.workspaceDao())
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun refreshWritesTheServerListToRoom() = runTest {
        api.workspaces = Result.success(
            WorkspaceCollection(
                items = listOf(workspace(id = "ws_01", name = "harold")),
                page = PageInfo(limit = 100, count = 1),
            ),
        )

        val result = repository.refresh(ORIGIN)

        assertTrue(result.isSuccess)
        assertEquals(
            listOf("harold"),
            repository.observe(ORIGIN).first().map { cached -> cached.workspace.name },
        )
    }

    @Test
    fun refreshFailureLeavesTheCachedListAlone() = runTest {
        api.workspaces = Result.success(
            WorkspaceCollection(
                items = listOf(workspace(id = "ws_01", name = "cached")),
                page = PageInfo(limit = 100, count = 1),
            ),
        )
        repository.refresh(ORIGIN)
        api.workspaces = Result.failure(IllegalStateException("offline"))

        val result = repository.refresh(ORIGIN)

        assertTrue(result.isFailure)
        assertEquals(
            listOf("cached"),
            repository.observe(ORIGIN).first().map { cached -> cached.workspace.name },
        )
    }

    @Test
    fun createCachesTheWorkspaceOnlyAfterTheServerAcceptsIt() = runTest {
        val result = repository.create(ORIGIN, CreateWorkspaceBody(name = "new", path = "/tmp/new"))

        assertTrue(result.isSuccess)
        assertEquals(
            listOf("new"),
            repository.observe(ORIGIN).first().map { cached -> cached.workspace.name },
        )
    }

    @Test
    fun createFailureDoesNotWriteToRoom() = runTest {
        api.created = Result.failure(IllegalStateException("offline"))

        val result = repository.create(ORIGIN, CreateWorkspaceBody(name = "new", path = "/tmp/new"))

        assertTrue(result.isFailure)
        assertTrue(repository.observe(ORIGIN).first().isEmpty())
    }

    private fun workspace(
        id: String,
        name: String,
    ) = Workspace(
        id = id,
        name = name,
        path = "/tmp/$id",
        state = WorkspaceState.Available,
        createdAt = "2026-08-01T00:00:00.000Z",
        lastUsedAt = "2026-08-01T00:00:00.000Z",
    )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private class WorkspaceFakeAgentApi : AgentApi {
    var workspaces: Result<WorkspaceCollection> = Result.success(
        WorkspaceCollection(items = emptyList(), page = PageInfo(limit = 100, count = 0)),
    )
    var created: Result<Workspace> = Result.success(
        Workspace(
            id = "ws_new",
            name = "new",
            path = "/tmp/new",
            state = WorkspaceState.Available,
            createdAt = "2026-08-01T00:00:00.000Z",
            lastUsedAt = "2026-08-01T00:00:00.000Z",
        ),
    )

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> = workspaces

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = created

    override suspend fun getRuntimeSettings(serverOrigin: String) = unused<RuntimeSettingsView>()

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ) = unused<FilesystemDirectoryCollection>()

    override suspend fun listSessions(serverOrigin: String, cwd: String?) = unused<SessionCollection>()

    override suspend fun listAgents(serverOrigin: String) = unused<AgentSettingsCollection>()

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ) = unused<CreateSessionResponse>()

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ) = unused<Unit>()

    override suspend fun getAgentAuth(serverOrigin: String, agentId: AgentId) = unused<AgentAuth>()

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: AgentId,
    ) = unused<AgentAuthSession>()

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: AuthSessionAction,
    ) = unused<AgentAuthSession>()

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ) = unused<AgentAuthSummary>()

    override suspend fun revokeDevice(serverOrigin: String, deviceId: String) = unused<Unit>()

    private fun <T> unused(): Result<T> = Result.failure(UnsupportedOperationException())
}
