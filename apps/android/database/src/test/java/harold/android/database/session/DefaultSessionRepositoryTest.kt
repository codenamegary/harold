package harold.android.database.session

import androidx.room.Room
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.PageInfo
import harold.android.contracts.Session
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceState
import harold.android.database.workspace.DefaultWorkspaceRepository
import harold.android.database.workspace.WorkspaceRepository
import harold.android.network.AgentSessionSnapshot
import harold.android.network.CatalogSession
import harold.android.network.SessionCatalogReader
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
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
class DefaultSessionRepositoryTest {
    private lateinit var database: TestChatDatabase
    private lateinit var api: ChatFakeAgentApi
    private lateinit var workspaceRepository: WorkspaceRepository
    private lateinit var agentRepository: AgentRepository
    private lateinit var catalog: FakeSessionCatalog
    private lateinit var worktreePaths: FakeWorktreePathStore
    private lateinit var repository: DefaultSessionRepository

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            RuntimeEnvironment.getApplication(),
            TestChatDatabase::class.java,
        ).allowMainThreadQueries().build()
        api = ChatFakeAgentApi()
        workspaceRepository = DefaultWorkspaceRepository(
            agentApi = api,
            dao = database.workspaceDao(),
        )
        agentRepository = DefaultAgentRepository(
            agentSettingsApi = api,
            agentDao = database.agentDao(),
        )
        catalog = FakeSessionCatalog()
        worktreePaths = FakeWorktreePathStore()
        repository = DefaultSessionRepository(
            agentApi = api,
            agentRepository = agentRepository,
            workspaceRepository = workspaceRepository,
            catalog = catalog,
            worktreePaths = worktreePaths,
        )
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun liveSnapshotIsComposedWithWorkspaceAgentAndWorktree() = runTest {
        catalog.replace(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessions = listOf(catalogSession("sess_01", "Alpha")),
        )
        worktreePaths.seed(ORIGIN, "cursor", "sess_01", "/repo/.worktrees/a")
        api.sessions = Result.success(SessionCollection(listOf(session("sess_01", "Alpha"))))

        assertTrue(repository.refresh(ORIGIN).isSuccess)

        val cached = repository.observeSessions(ORIGIN).first().single()
        assertEquals("harold", cached.workspaceName)
        assertEquals("ws_01", cached.workspaceId)
        assertEquals("Cursor", cached.agentLabel)
        assertEquals("/repo/.worktrees/a", cached.session.worktreePath)
    }

    @Test
    fun refreshFailureLeavesTheLiveSnapshotAlone() = runTest {
        catalog.replace(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessions = listOf(catalogSession("sess_01", "Live")),
        )
        api.sessions = Result.failure(IllegalStateException("offline"))

        val result = repository.refresh(ORIGIN)

        assertTrue(result.isFailure)
        assertEquals(
            listOf("Live"),
            repository.observeSessions(ORIGIN).first().map { cached -> cached.session.title },
        )
    }

    @Test
    fun refreshReturnsTheLiveListsAndUpdatesTheCaches() = runTest {
        catalog.replace(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessions = listOf(catalogSession("sess_01", "Alpha")),
        )
        api.sessions = Result.success(SessionCollection(listOf(session("sess_01", "Alpha"))))

        val result = repository.refresh(ORIGIN)

        val live = result.getOrThrow()
        assertEquals(listOf("cursor"), live.agents.map { agent -> agent.id })
        assertEquals(listOf("harold"), live.workspaces.map { workspace -> workspace.name })
        assertEquals(
            listOf("harold"),
            workspaceRepository.observe(ORIGIN).first().map { cached -> cached.workspace.name },
        )
        assertEquals(
            listOf("cursor"),
            agentRepository.observeAgents(ORIGIN).first().map { cached -> cached.agentId },
        )
    }

    @Test
    fun updateWorktreePathWritesTheSeparateStore() = runTest {
        catalog.replace(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessions = listOf(catalogSession("sess_01", "Alpha")),
        )

        repository.updateWorktreePath(ORIGIN, "cursor", "sess_01", "/repo/.worktrees/feat-x")

        assertEquals(
            "/repo/.worktrees/feat-x",
            repository.observeSessions(ORIGIN).first().single().session.worktreePath,
        )
        assertEquals(
            listOf("/repo/.worktrees/feat-x"),
            worktreePaths.saved,
        )
    }

    @Test
    fun createAndDeleteUseTheLiveAgentApi() = runTest {
        catalog.replace(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessions = listOf(catalogSession("sess_01", "Alpha")),
        )

        val created = repository.createSession(
            connectionId = ORIGIN,
            body = CreateSessionBody(agentId = "cursor", cwd = "/tmp/harold"),
        )

        assertTrue(created.isSuccess)
        assertEquals("sess_new", created.getOrThrow().sessionId)
        assertEquals(listOf("/tmp/harold"), api.createdCwds)

        assertTrue(repository.deleteSession(ORIGIN, "cursor", "sess_01").isSuccess)
        assertEquals(listOf("sess_01"), api.deletedSessions)
    }

    @Test
    fun worktreePathSurvivesAFreshAgentList() = runTest {
        catalog.replace(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessions = listOf(catalogSession("sess_01", "Alpha")),
        )
        worktreePaths.seed(ORIGIN, "cursor", "sess_01", "/repo/.worktrees/feat-x")

        catalog.replace(
            connectionId = ORIGIN,
            agentId = "cursor",
            sessions = listOf(catalogSession("sess_01", "Renamed")),
        )

        val cached = repository.observeSessions(ORIGIN).first().single()
        assertEquals("Renamed", cached.session.title)
        assertEquals("/repo/.worktrees/feat-x", cached.session.worktreePath)
    }

    private fun catalogSession(id: String, title: String) = CatalogSession(
        agentId = "cursor",
        sessionId = id,
        cwd = "/tmp/harold",
        title = title,
        updatedAt = "2026-08-01T00:00:00.000Z",
    )

    private fun session(
        id: String,
        title: String,
    ) = Session(
        agentId = "cursor",
        sessionId = id,
        cwd = "/tmp/harold",
        title = title,
        updatedAt = "2026-08-01T00:00:00.000Z",
    )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private class FakeSessionCatalog : SessionCatalogReader {
    private val snapshots = MutableStateFlow<List<AgentSessionSnapshot>>(emptyList())

    override fun observeSnapshots(): Flow<List<AgentSessionSnapshot>> = snapshots

    override fun observeSnapshots(connectionId: String): Flow<List<AgentSessionSnapshot>> =
        snapshots.map { all -> all.filter { snapshot -> snapshot.connectionId == connectionId } }

    override fun snapshots(): List<AgentSessionSnapshot> = snapshots.value

    override fun sessions(connectionId: String): List<CatalogSession> =
        snapshots.value.filter { snapshot -> snapshot.connectionId == connectionId }
            .flatMap { snapshot -> snapshot.sessions }

    override fun find(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): CatalogSession? = sessions(connectionId)
        .firstOrNull { session -> session.agentId == agentId && session.sessionId == sessionId }

    override fun sessionDirectories(connectionId: String): List<String> =
        sessions(connectionId).map { session -> session.cwd }.distinct()

    fun replace(
        connectionId: String,
        agentId: AgentId,
        sessions: List<CatalogSession>,
    ) {
        val others = snapshots.value.filterNot { snapshot ->
            snapshot.connectionId == connectionId && snapshot.agentId == agentId
        }
        snapshots.value = others + AgentSessionSnapshot(
            connectionId = connectionId,
            agentId = agentId,
            sessions = sessions,
        )
    }
}

private class FakeWorktreePathStore : SessionWorktreePathStore {
    private val paths = MutableStateFlow<List<StoredWorktreePath>>(emptyList())
    val saved = mutableListOf<String?>()

    override fun observeWorktreePaths(): Flow<List<StoredWorktreePath>> = paths

    override fun observeWorktreePaths(connectionId: String): Flow<List<StoredWorktreePath>> =
        paths.map { all -> all.filter { path -> path.connectionId == connectionId } }

    override suspend fun saveWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ): Result<Unit> {
        saved += worktreePath
        paths.value = paths.value.filterNot { path ->
            path.connectionId == connectionId &&
                path.agentId == agentId &&
                path.sessionId == sessionId
        } + listOfNotNull(
            worktreePath?.let { value ->
                StoredWorktreePath(connectionId, agentId, sessionId, value)
            },
        )
        return Result.success(Unit)
    }

    fun seed(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String,
    ) {
        paths.value = paths.value + StoredWorktreePath(connectionId, agentId, sessionId, worktreePath)
    }
}

private class ChatFakeAgentApi : harold.android.network.AcpAgentApi,
    harold.android.network.AgentSettingsApi,
    harold.android.network.WorkspaceApi {
    var sessions: Result<SessionCollection> = Result.success(SessionCollection(emptyList()))
    var agents: Result<AgentSettingsCollection> = Result.success(
        AgentSettingsCollection(
            listOf(
                AgentSettings(
                    id = "cursor",
                    displayName = "Cursor",
                    available = true,
                    enabled = true,
                    path = null,
                ),
            ),
        ),
    )
    var workspaces: Result<WorkspaceCollection> = Result.success(
        WorkspaceCollection(
            items = listOf(
                Workspace(
                    id = "ws_01",
                    name = "harold",
                    path = "/tmp/harold",
                    state = WorkspaceState.Available,
                    createdAt = "2026-08-01T00:00:00.000Z",
                    lastUsedAt = "2026-08-01T00:00:00.000Z",
                ),
            ),
            page = PageInfo(limit = 100, count = 1),
        ),
    )
    var created: Result<CreateSessionResponse> = Result.success(
        CreateSessionResponse(
            agentId = "cursor",
            sessionId = "sess_new",
            cwd = "/tmp/harold",
            title = "New session",
            updatedAt = "2026-08-01T00:00:00.000Z",
            configOptions = emptyList(),
        ),
    )
    var deleted: Result<Unit> = Result.success(Unit)
    val createdCwds = mutableListOf<String>()
    val deletedSessions = mutableListOf<String>()

    override suspend fun listSessions(
        connectionId: String,
        cwd: String?,
    ): Result<SessionCollection> = sessions

    override suspend fun listAgents(connectionId: String): Result<AgentSettingsCollection> = agents

    override suspend fun listWorkspaces(
        connectionId: String,
        limit: Int,
    ): Result<WorkspaceCollection> = workspaces

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> {
        createdCwds += body.cwd
        return created
    }

    override suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> {
        deletedSessions += sessionId
        return deleted
    }

    override suspend fun listFilesystemDirectories(
        connectionId: String,
        root: String?,
    ) = unused<FilesystemDirectoryCollection>()

    override suspend fun createFilesystemDirectory(
        connectionId: String,
        body: harold.android.contracts.CreateFilesystemDirectoryBody,
    ) = Result.failure<harold.android.contracts.FilesystemDirectoryCreated>(
        UnsupportedOperationException("unused"),
    )

    override suspend fun createWorkspace(
        connectionId: String,
        body: CreateWorkspaceBody,
    ) = unused<Workspace>()

    override suspend fun setConfigOption(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        configId: String,
        value: harold.android.contracts.ConfigValue,
    ) = unused<Unit>()

    override suspend fun prompt(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        body: harold.android.contracts.PromptRequestBody,
    ) = unused<harold.android.network.PromptResult>()

    override suspend fun cancel(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) = unused<Unit>()

    override suspend fun replyPermission(
        connectionId: String,
        requestId: String,
        optionId: String,
    ) = unused<Unit>()

    override suspend fun replyExtension(
        connectionId: String,
        requestId: String,
        result: kotlinx.serialization.json.JsonElement,
    ) = unused<Unit>()

    private fun <T> unused(): Result<T> = Result.failure(UnsupportedOperationException())
}
