package harold.android.connections

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AgentLogs
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.FilesystemDirectoryCreated
import harold.android.contracts.HostLogs
import harold.android.contracts.LogCleanupPolicy
import harold.android.contracts.LogCleanupResult
import harold.android.contracts.LogRun
import harold.android.contracts.SessionCollection
import harold.android.contracts.UpdateAgentBody
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.SavedConnection
import harold.android.live.SessionOwner
import harold.android.live.SessionSnapshot
import harold.android.navigation.Navigator
import harold.android.session.ActiveConnectionState
import harold.android.stream.ConnectionState
import harold.android.testing.FakeConnectionGateway
import harold.android.testing.FakeConnectionStore
import harold.android.testing.FakeSshCredentialStore
import harold.android.user.UserRepository
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConnectionSettingsViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun logsLoadWithoutBlockingTheSettingsForm() = runTest {
        val repository = FakeLogsUserRepository()
        val viewModel = viewModel(repository)

        viewModel.start(CONNECTION_ID)

        assertTrue(viewModel.uiState.value.loaded)
        assertEquals("Demo host", viewModel.uiState.value.name)
        val logs = viewModel.uiState.value.agentLogs
        assertFalse(logs.loading)
        assertNull(logs.error)
        assertNotNull(logs.logs)
        assertEquals(1, repository.listCalls)
    }

    @Test
    fun aLogFailureLeavesTheFormLoaded() = runTest {
        val repository = FakeLogsUserRepository(
            listResult = Result.failure(IllegalStateException("host went away")),
        )
        val viewModel = viewModel(repository)

        viewModel.start(CONNECTION_ID)

        assertTrue(viewModel.uiState.value.loaded)
        val logs = viewModel.uiState.value.agentLogs
        assertFalse(logs.loading)
        assertEquals("host went away", logs.error)
        assertNull(logs.logs)
    }

    @Test
    fun cleanupConfirmsThenDeletesAndRefreshes() = runTest {
        val repository = FakeLogsUserRepository()
        val viewModel = viewModel(repository)
        viewModel.start(CONNECTION_ID)

        viewModel.showLogCleanupConfirm()
        assertTrue(viewModel.uiState.value.agentLogs.cleanupConfirmVisible)

        viewModel.cleanupLogs()

        assertEquals(1, repository.cleanupCalls)
        assertEquals(2, repository.listCalls)
        val logs = viewModel.uiState.value.agentLogs
        assertFalse(logs.cleanupConfirmVisible)
        assertFalse(logs.cleanupRunning)
        assertEquals(LogCleanupResult(deletedRuns = 2, removedBytes = 240), logs.cleanupResult)
        assertEquals(
            listOf("20260103T000000Z-3", "20260102T000000Z-2"),
            logs.logs?.agents.orEmpty().flatMap { agent -> agent.runs.map { run -> run.id } },
        )
    }

    @Test
    fun hidingTheConfirmationKeepsTheLogs() = runTest {
        val viewModel = viewModel(FakeLogsUserRepository())
        viewModel.start(CONNECTION_ID)

        viewModel.showLogCleanupConfirm()
        viewModel.hideLogCleanupConfirm()

        assertFalse(viewModel.uiState.value.agentLogs.cleanupConfirmVisible)
        assertNotNull(viewModel.uiState.value.agentLogs.logs)
    }

    private fun viewModel(repository: UserRepository): ConnectionSettingsViewModel =
        ConnectionSettingsViewModel(
            repository = ConnectionRepository(FakeConnectionStore(saved())),
            credentialStore = FakeSshCredentialStore(),
            userRepository = repository,
            connectionGateway = FakeConnectionGateway(
                ActiveConnectionState.Active(CONNECTION_ID, "Pixel"),
            ),
            sessionOwner = StubSessionOwner(),
            navigator = Navigator(),
        )

    private fun saved() = SavedConnection(
        formatVersion = 3,
        connectionId = CONNECTION_ID,
        deviceName = "Pixel",
        name = "Demo host",
        colorId = "tide",
        iconId = "terminal",
        ssh = SshConfig(
            host = "127.0.0.1",
            port = 22,
            user = "gary",
            auth = SshAuth.Password(secret = "hunter2"),
            hostKeyFingerprint = "SHA256:abc",
        ),
    )

    private class FakeLogsUserRepository(
        private val listResult: Result<HostLogs> = Result.success(twoAgentLogs()),
        private val cleanupResult: Result<LogCleanupResult> = Result.success(
            LogCleanupResult(deletedRuns = 2, removedBytes = 240),
        ),
    ) : UserRepository {
        var listCalls = 0
            private set
        var cleanupCalls = 0
            private set
        private var current = listResult

        override suspend fun listHostLogs(connectionId: String): Result<HostLogs> {
            listCalls += 1
            val result = if (listCalls > 1 && current.isSuccess) {
                Result.success(afterCleanupLogs())
            } else {
                current
            }
            return result
        }

        override suspend fun cleanupHostLogs(
            connectionId: String,
            policy: LogCleanupPolicy,
        ): Result<LogCleanupResult> {
            cleanupCalls += 1
            if (cleanupResult.isFailure) {
                current = Result.failure(cleanupResult.exceptionOrNull()!!)
            }
            return cleanupResult
        }

        override suspend fun listWorkspaces(connectionId: String, limit: Int) =
            unused<WorkspaceCollection>()
        override suspend fun listFilesystemDirectories(
            connectionId: String,
            root: String?,
        ) = unused<FilesystemDirectoryCollection>()
        override suspend fun createFilesystemDirectory(
            connectionId: String,
            body: CreateFilesystemDirectoryBody,
        ) = unused<FilesystemDirectoryCreated>()
        override suspend fun createWorkspace(connectionId: String, body: CreateWorkspaceBody) =
            unused<Workspace>()
        override suspend fun listSessions(connectionId: String, cwd: String?) =
            unused<SessionCollection>()
        override suspend fun listAgents(connectionId: String) = unused<AgentSettingsCollection>()
        override suspend fun createSession(connectionId: String, body: CreateSessionBody) =
            unused<CreateSessionResponse>()
        override suspend fun deleteSession(connectionId: String, agentId: AgentId, sessionId: String) =
            unused<Unit>()
        override suspend fun getAgentAuth(connectionId: String, agentId: AgentId) =
            unused<AgentAuth>()
        override suspend fun logoutAgentAuth(connectionId: String, agentId: AgentId) =
            unused<AgentAuthSummary>()
        override suspend fun scanAgents(connectionId: String) = unused<AgentSettingsCollection>()
        override suspend fun updateAgent(
            connectionId: String,
            agentId: AgentId,
            body: UpdateAgentBody,
        ) = unused<AgentSettings>()
        override suspend fun createCustomAgent(
            connectionId: String,
            body: CreateCustomAgentBody,
        ) = unused<AgentSettings>()
        override suspend fun deleteAgent(connectionId: String, agentId: AgentId) = unused<Unit>()
        override suspend fun reloadConfig(connectionId: String) = unused<AgentSettingsCollection>()
        override suspend fun restartAgent(connectionId: String, agentId: AgentId) = unused<Unit>()
        override suspend fun getAgentCapabilities(
            connectionId: String,
            agentId: AgentId,
            sessionId: String,
        ) = unused<AgentCapabilityInventory?>()

        private fun <T> unused(): Result<T> = Result.failure(UnsupportedOperationException())
    }

    private class StubSessionOwner : SessionOwner {
        override val connectionState = MutableStateFlow(ConnectionState())
        override val snapshot = MutableStateFlow(SessionSnapshot())
        override val sessionTitles = MutableStateFlow(emptyMap<String, String>())
        override val promptCompletions = MutableSharedFlow<Unit>()
        override fun connect(connectionId: String) = Unit
        override fun retry() = Unit
        override fun disconnect() = Unit
        override fun onForeground() = Unit
        override fun onBackground() = Unit
        override fun watch(agentId: String?, sessionId: String?) = Unit
        override suspend fun prompt(
            text: String,
            attachments: List<harold.android.contracts.AttachmentReference>,
        ) = Result.success(Unit)
        override suspend fun cancel() = Result.success(Unit)
        override suspend fun replyPermission(requestId: String, optionId: String) =
            Result.success(Unit)
        override suspend fun replyExtension(
            requestId: String,
            result: kotlinx.serialization.json.JsonElement,
        ) = Result.success(Unit)
        override fun rememberConfig(
            agentId: String,
            sessionId: String,
            configOptions: List<harold.android.contracts.ConfigOption>,
        ) = Unit
        override fun forget(agentId: String, sessionId: String) = Unit
    }

    private companion object {
        const val CONNECTION_ID = "ssh://gary@127.0.0.1:22"

        fun twoAgentLogs(): HostLogs = HostLogs(
            agents = listOf(
                AgentLogs(
                    agentId = "opencode",
                    displayName = "OpenCode",
                    hostRunning = true,
                    activeRunId = "20260103T000000Z-3",
                    runs = listOf(
                        run("20260103T000000Z-3", out = 120, active = true),
                        run("20260102T000000Z-2", out = 90),
                        run("20260101T000000Z-1", out = 60),
                    ),
                ),
                AgentLogs(
                    agentId = "claude",
                    displayName = "Claude Agent",
                    hostRunning = false,
                    activeRunId = "20260102T000000Z-2",
                    runs = listOf(
                        run("20260102T000000Z-2", out = 30, active = true),
                        run("20260101T000000Z-1", out = 20),
                    ),
                ),
            ),
            fetchedAt = Instant.parse("2026-11-17T15:00:00Z"),
        )

        fun afterCleanupLogs(): HostLogs = HostLogs(
            agents = listOf(
                AgentLogs(
                    agentId = "opencode",
                    displayName = "OpenCode",
                    hostRunning = true,
                    activeRunId = "20260103T000000Z-3",
                    runs = listOf(run("20260103T000000Z-3", out = 120, active = true)),
                ),
                AgentLogs(
                    agentId = "claude",
                    displayName = "Claude Agent",
                    hostRunning = false,
                    activeRunId = "20260102T000000Z-2",
                    runs = listOf(run("20260102T000000Z-2", out = 30, active = true)),
                ),
            ),
            fetchedAt = Instant.parse("2026-11-17T15:01:00Z"),
        )

        fun run(id: String, out: Long, active: Boolean = false): LogRun = LogRun(
            id = id,
            startedAt = null,
            outBytes = out,
            errBytes = 0,
            active = active,
        )
    }
}
