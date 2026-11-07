package harold.android.chat.auth

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.user.UserRepository
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Drives the agent-auth controller through its public interface the way the
 * chat view model does: hydrate on session switch, and stream updates.
 */
class AgentAuthControllerTest {
    private val selectedAgentId = "cursor"

    private fun controller(
        repository: FakeAuthUserRepository,
        selected: () -> AgentId? = { selectedAgentId },
        scope: CoroutineScope = CoroutineScope(UnconfinedTestDispatcher()),
    ) = AgentAuthController(
        userRepository = repository,
        scope = scope,
        origin = { ORIGIN },
        selectedAgent = selected,
    )

    @Test
    fun hydrationShowsTheAgentAuthOnThePanel() = runTest {
        val repository = FakeAuthUserRepository(
            auth = auth(AgentAuthStatus.NeedsAuth),
        )
        val agentAuth = controller(repository)

        agentAuth.hydrate(selectedAgentId)

        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)
        assertEquals(
            AgentAuthStatus.NeedsAuth,
            agentAuth.state.value.summary?.status,
        )
        assertNull(agentAuth.state.value.error)
    }

    @Test
    fun failedHydrationSurfacesTheApiError() = runTest {
        val repository = FakeAuthUserRepository(
            authFailure = IllegalStateException("offline"),
        )
        val agentAuth = controller(repository)

        agentAuth.hydrate(selectedAgentId)

        assertNull(agentAuth.state.value.agentAuth)
        assertEquals("offline", agentAuth.state.value.error)
    }

    @Test
    fun staleHydrationDoesNotClobberTheNewerAgent() = runTest {
        val firstArrival = CompletableDeferred<Result<AgentAuth>>()
        val secondArrival = CompletableDeferred<Result<AgentAuth>>()
        val repository = FakeAuthUserRepository()
        repository.gates += firstArrival
        repository.gates += secondArrival
        val agentAuth = controller(repository)

        launch { agentAuth.hydrate(selectedAgentId) }
        runCurrent()
        launch { agentAuth.hydrate(selectedAgentId) }
        runCurrent()

        secondArrival.complete(Result.success(auth(AgentAuthStatus.NeedsAuth)))
        advanceUntilIdle()
        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)

        firstArrival.complete(Result.success(auth(AgentAuthStatus.Authenticated)))
        advanceUntilIdle()
        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)
    }

    @Test
    fun hydrationForADeselectedAgentDoesNotTouchThePanel() = runTest {
        val gate = CompletableDeferred<Result<AgentAuth>>()
        val repository = FakeAuthUserRepository()
        repository.gates += gate
        var selected: AgentId? = selectedAgentId
        val agentAuth = controller(repository, selected = { selected })

        launch { agentAuth.hydrate(selectedAgentId) }
        runCurrent()
        selected = null
        gate.complete(Result.success(auth(AgentAuthStatus.Authenticated)))
        advanceUntilIdle()

        assertNull(agentAuth.state.value.agentAuth)
        assertNull(agentAuth.state.value.summary)
    }

    @Test
    fun resetForClearsThePanelAndSeedsTheIncomingAgent() = runTest {
        val repository = FakeAuthUserRepository(auth = auth(AgentAuthStatus.NeedsAuth))
        val agentAuth = controller(repository)
        agentAuth.hydrate(selectedAgentId)
        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)

        agentAuth.resetFor("other")
        assertNull(agentAuth.state.value.agentAuth)
        assertNull(agentAuth.state.value.summary)

        agentAuth.resetFor(selectedAgentId)
        assertNull(agentAuth.state.value.agentAuth)
        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.summary?.status)

        agentAuth.resetFor(null)
        assertNull(agentAuth.state.value.agentAuth)
        assertNull(agentAuth.state.value.summary)
    }

    @Test
    fun streamAuthAdoptsTheStreamedStatus() = runTest {
        val repository = FakeAuthUserRepository()
        val agentAuth = controller(repository)

        agentAuth.absorbStream(selectedAgentId, auth(AgentAuthStatus.Authenticated))

        assertEquals(AgentAuthStatus.Authenticated, agentAuth.state.value.agentAuth?.status)
        assertEquals(AgentAuthStatus.Authenticated, agentAuth.state.value.summary?.status)
        assertEquals(
            AgentAuthStatus.Authenticated,
            agentAuth.summary(selectedAgentId)?.status,
        )
    }

    @Test
    fun nullStreamAuthLeavesThePanelAlone() = runTest {
        val repository = FakeAuthUserRepository(auth = auth(AgentAuthStatus.NeedsAuth))
        val agentAuth = controller(repository)
        agentAuth.hydrate(selectedAgentId)

        agentAuth.absorbStream(selectedAgentId, null)

        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)
    }

    private fun auth(
        status: AgentAuthStatus,
        agentId: AgentId = selectedAgentId,
    ) = AgentAuth(
        agentId = agentId,
        status = status,
        error = null,
        session = null,
    )

    private class FakeAuthUserRepository(
        var auth: AgentAuth = AgentAuth(
            agentId = "cursor",
            status = AgentAuthStatus.Unknown,
            error = null,
            session = null,
        ),
        var authFailure: Throwable? = null,
    ) : UserRepository {
        val authGetCalls = mutableListOf<String>()

        /** Hold getAgentAuth calls until the test releases them, one gate per call. */
        val gates = ArrayDeque<CompletableDeferred<Result<AgentAuth>>>()

        override suspend fun getAgentAuth(
            connectionId: String,
            agentId: AgentId,
        ): Result<AgentAuth> {
            authGetCalls += agentId
            gates.removeFirstOrNull()?.let { gate -> return gate.await() }
            authFailure?.let { return Result.failure(it) }
            return Result.success(auth.copy(agentId = agentId))
        }

        override suspend fun logoutAgentAuth(
            connectionId: String,
            agentId: AgentId,
        ) = Result.failure<AgentAuthSummary>(UnsupportedOperationException())

        override suspend fun listWorkspaces(
            connectionId: String,
            limit: Int,
        ) = Result.failure<WorkspaceCollection>(UnsupportedOperationException())

        override suspend fun listFilesystemDirectories(
            connectionId: String,
            root: String?,
        ) = Result.failure<FilesystemDirectoryCollection>(UnsupportedOperationException())

        override suspend fun createFilesystemDirectory(
            connectionId: String,
            body: CreateFilesystemDirectoryBody,
        ) = Result.failure<harold.android.contracts.FilesystemDirectoryCreated>(
            UnsupportedOperationException("unused"),
        )

        override suspend fun createWorkspace(
            connectionId: String,
            body: CreateWorkspaceBody,
        ) = Result.failure<Workspace>(UnsupportedOperationException())

        override suspend fun listSessions(
            connectionId: String,
            cwd: String?,
        ) = Result.failure<SessionCollection>(UnsupportedOperationException())

        override suspend fun listAgents(connectionId: String) =
            Result.failure<AgentSettingsCollection>(UnsupportedOperationException())

        override suspend fun createSession(
            connectionId: String,
            body: CreateSessionBody,
        ) = Result.failure<CreateSessionResponse>(UnsupportedOperationException())

        override suspend fun deleteSession(
            connectionId: String,
            agentId: AgentId,
            sessionId: String,
        ) = Result.failure<Unit>(UnsupportedOperationException())
    }

    companion object {
        private const val ORIGIN = "ssh://gary@connection.local:22"
    }
}
