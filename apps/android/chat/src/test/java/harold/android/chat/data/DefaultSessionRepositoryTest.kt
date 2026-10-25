package harold.android.chat.data

import androidx.room.Room
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.PageInfo
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.Session
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
class DefaultSessionRepositoryTest {
    private lateinit var database: TestChatDatabase
    private lateinit var api: ChatFakeAgentApi
    private lateinit var repository: DefaultSessionRepository

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            RuntimeEnvironment.getApplication(),
            TestChatDatabase::class.java,
        ).allowMainThreadQueries().build()
        api = ChatFakeAgentApi()
        repository = DefaultSessionRepository(
            agentApi = api,
            sessionDao = database.sessionDao(),
            agentDao = database.agentDao(),
        )
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun refreshCachesSessionsWithWorkspaceAndAgentLabels() = runTest {
        api.sessions = Result.success(SessionCollection(listOf(session("sess_01", "Alpha"))))

        val result = repository.refresh(ORIGIN)

        assertTrue(result.isSuccess)
        val cached = repository.observeSessions(ORIGIN).first().single()
        assertEquals("harold", cached.workspaceName)
        assertEquals("ws_01", cached.workspaceId)
        assertEquals("Cursor", cached.agentLabel)
    }

    @Test
    fun refreshUsesListsTheCallerAlreadyFetched() = runTest {
        api.sessions = Result.success(SessionCollection(listOf(session("sess_01", "Alpha"))))
        api.agents = Result.failure(IllegalStateException("must not fetch"))
        api.workspaces = Result.failure(IllegalStateException("must not fetch"))

        val result = repository.refresh(
            serverOrigin = ORIGIN,
            snapshot = SessionRefresh(
                agents = listOf(
                    AgentSettings(
                        id = "cursor",
                        displayName = "Cursor from snapshot",
                        available = true,
                        enabled = true,
                        path = null,
                    ),
                ),
                workspaces = listOf(
                    Workspace(
                        id = "ws_01",
                        name = "snapshot",
                        path = "/tmp/harold",
                        state = WorkspaceState.Available,
                        createdAt = "2026-08-01T00:00:00.000Z",
                        lastUsedAt = "2026-08-01T00:00:00.000Z",
                    ),
                ),
            ),
        )

        assertTrue(result.isSuccess)
        val cached = repository.observeSessions(ORIGIN).first().single()
        assertEquals("snapshot", cached.workspaceName)
        assertEquals("Cursor from snapshot", cached.agentLabel)
    }

    @Test
    fun refreshFailureKeepsThePreviousCache() = runTest {
        api.sessions = Result.success(SessionCollection(listOf(session("sess_01", "cached"))))
        repository.refresh(ORIGIN)
        api.sessions = Result.failure(IllegalStateException("offline"))

        val result = repository.refresh(ORIGIN)

        assertTrue(result.isFailure)
        assertEquals(
            listOf("cached"),
            repository.observeSessions(ORIGIN).first().map { cached -> cached.session.title },
        )
    }

    @Test
    fun refreshAgentsCachesTheAgentList() = runTest {
        val result = repository.refreshAgents(ORIGIN)

        assertTrue(result.isSuccess)
        assertEquals(
            listOf("cursor"),
            repository.observeAgents(ORIGIN).first().map { cached -> cached.agentId },
        )
    }

    @Test
    fun createCachesTheSessionOnlyAfterTheServerAcceptsIt() = runTest {
        repository.refreshAgents(ORIGIN)

        val result = repository.createSession(
            serverOrigin = ORIGIN,
            body = CreateSessionBody(agentId = "cursor", cwd = "/tmp/harold"),
        )

        assertTrue(result.isSuccess)
        val cached = repository.observeSessions(ORIGIN).first().single()
        assertEquals("sess_new", cached.session.sessionId)
        // Workspace labels arrive with the next list refresh; a create call has
        // no workspace payload to read.
        assertEquals("/tmp/harold", cached.workspaceName)
        assertEquals("Cursor", cached.agentLabel)
    }

    @Test
    fun createFailureDoesNotWriteToRoom() = runTest {
        api.created = Result.failure(IllegalStateException("offline"))

        val result = repository.createSession(
            serverOrigin = ORIGIN,
            body = CreateSessionBody(agentId = "cursor", cwd = "/tmp/harold"),
        )

        assertTrue(result.isFailure)
        assertTrue(repository.observeSessions(ORIGIN).first().isEmpty())
    }

    @Test
    fun deleteRemovesTheCachedSessionAfterTheServerAcceptsIt() = runTest {
        api.sessions = Result.success(
            SessionCollection(listOf(session("sess_01", "Alpha"), session("sess_02", "Beta"))),
        )
        repository.refresh(ORIGIN)

        val result = repository.deleteSession(ORIGIN, "cursor", "sess_01")

        assertTrue(result.isSuccess)
        assertEquals(
            listOf("sess_02"),
            repository.observeSessions(ORIGIN).first().map { cached -> cached.session.sessionId },
        )
    }

    @Test
    fun deleteFailureKeepsTheCachedSession() = runTest {
        api.sessions = Result.success(SessionCollection(listOf(session("sess_01", "Alpha"))))
        repository.refresh(ORIGIN)
        api.deleted = Result.failure(IllegalStateException("offline"))

        val result = repository.deleteSession(ORIGIN, "cursor", "sess_01")

        assertTrue(result.isFailure)
        assertEquals(1, repository.observeSessions(ORIGIN).first().size)
    }

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

private class ChatFakeAgentApi : AgentApi {
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

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ): Result<SessionCollection> = sessions

    override suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection> = agents

    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ): Result<WorkspaceCollection> = workspaces

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = created

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = deleted

    override suspend fun getRuntimeSettings(serverOrigin: String) = unused<RuntimeSettingsView>()

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ) = unused<FilesystemDirectoryCollection>()

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ) = unused<Workspace>()

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ) = unused<AgentAuth>()

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
