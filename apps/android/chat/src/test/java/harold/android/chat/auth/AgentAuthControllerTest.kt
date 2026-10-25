package harold.android.chat.auth

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.RuntimeSettingsView
import harold.android.contracts.SessionCollection
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.user.UserRepository
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Drives the agent-auth controller through its public interface the way the
 * chat view model does: hydrate on session switch, sign in, confirm, cancel,
 * logout, and stream updates.
 */
class AgentAuthControllerTest {
    private val selectedAgentId = "cursor"

    private fun controller(
        repository: FakeAuthUserRepository,
        scope: CoroutineScope,
        selected: () -> AgentId? = { selectedAgentId },
        onAuthenticated: (AgentId, AgentAuthStatus) -> Unit = { _, _ -> },
    ) = AgentAuthController(
        userRepository = repository,
        scope = scope,
        origin = { ORIGIN },
        selectedAgent = selected,
        onAuthenticated = onAuthenticated,
    )

    @Test
    fun hydrationShowsTheAgentAuthOnThePanel() = runTest {
        val repository = FakeAuthUserRepository(
            auth = auth(AgentAuthStatus.NeedsAuth),
        )
        val agentAuth = controller(repository, scope = this)

        agentAuth.hydrate(selectedAgentId)

        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)
        assertEquals(
            AgentAuthStatus.NeedsAuth,
            agentAuth.state.value.summary?.status,
        )
        assertNull(agentAuth.state.value.error)
        assertFalse(agentAuth.state.value.panelSubmitting)
        assertFalse(agentAuth.state.value.actionBusy)
    }

    @Test
    fun failedHydrationSurfacesTheApiError() = runTest {
        val repository = FakeAuthUserRepository(
            authFailure = IllegalStateException("offline"),
        )
        val agentAuth = controller(repository, scope = this)

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
        val agentAuth = controller(repository, scope = this)

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
        val agentAuth = controller(repository, scope = this, selected = { selected })

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
        val agentAuth = controller(repository, scope = this)
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
    fun streamAuthAdoptsTheCachedLogoutAbility() = runTest {
        val repository = FakeAuthUserRepository()
        val agentAuth = controller(repository, scope = this)
        agentAuth.mergeSummaries(
            mapOf(
                selectedAgentId to AgentAuthSummary(
                    status = AgentAuthStatus.Authenticated,
                    error = null,
                    activeSessionId = null,
                    canLogout = true,
                ),
            ),
        )

        agentAuth.absorbStream(selectedAgentId, auth(AgentAuthStatus.Authenticated))

        assertEquals(AgentAuthStatus.Authenticated, agentAuth.state.value.agentAuth?.status)
        assertEquals(AgentAuthStatus.Authenticated, agentAuth.state.value.summary?.status)
        assertTrue(agentAuth.state.value.summary?.canLogout == true)
        assertTrue(agentAuth.summary(selectedAgentId)?.canLogout == true)
    }

    @Test
    fun nullStreamAuthLeavesThePanelAlone() = runTest {
        val repository = FakeAuthUserRepository(auth = auth(AgentAuthStatus.NeedsAuth))
        val agentAuth = controller(repository, scope = this)
        agentAuth.hydrate(selectedAgentId)

        agentAuth.absorbStream(selectedAgentId, null)

        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)
    }

    @Test
    fun loginNotifiesTheHostWhenHydrationFindsAnAuthenticatedAgent() = runTest {
        val repository = FakeAuthUserRepository(auth = auth(AgentAuthStatus.Authenticated))
        val authenticatedWith = mutableListOf<Pair<AgentId, AgentAuthStatus>>()
        val agentAuth = controller(repository, scope = this) { agentId, status ->
            authenticatedWith += agentId to status
        }

        agentAuth.hydrate(selectedAgentId)

        assertEquals(listOf(selectedAgentId to AgentAuthStatus.Authenticated), authenticatedWith)
    }

    @Test
    fun signInStartsAnAuthSessionAndShowsTheResult() = runTest {
        val repository = FakeAuthUserRepository(
            startSession = AgentAuthSession(
                sessionId = "auth-1",
                agentId = selectedAgentId,
                status = AuthSessionStatus.InProgress,
                error = null,
            ),
        )
        val authenticatedWith = mutableListOf<Pair<AgentId, AgentAuthStatus>>()
        val agentAuth = controller(repository, scope = this) { agentId, status ->
            authenticatedWith += agentId to status
        }

        agentAuth.signIn(selectedAgentId)
        advanceUntilIdle()

        assertEquals(listOf(selectedAgentId), repository.authStartCalls)
        assertEquals("auth-1", agentAuth.state.value.agentAuth?.session?.sessionId)
        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)
        assertFalse(agentAuth.state.value.panelSubmitting)
        assertEquals(
            listOf(selectedAgentId to AgentAuthStatus.NeedsAuth),
            authenticatedWith,
        )
    }

    @Test
    fun failedSignInReleasesThePanelAndShowsTheError() = runTest {
        val repository = FakeAuthUserRepository(startSession = null)
        val agentAuth = controller(repository, scope = this)

        agentAuth.signIn(selectedAgentId)
        advanceUntilIdle()

        assertNull(agentAuth.state.value.agentAuth)
        assertFalse(agentAuth.state.value.panelSubmitting)
        assertEquals("Request failed", agentAuth.state.value.error)
    }

    @Test
    fun aSecondSignInIsIgnoredWhileOneIsInFlight() = runTest {
        val gate = CompletableDeferred<Result<AgentAuthSession>>()
        val repository = FakeAuthUserRepository()
        repository.startGates += gate
        val agentAuth = controller(repository, scope = this)

        agentAuth.signIn(selectedAgentId)
        runCurrent()
        agentAuth.signIn(selectedAgentId)
        runCurrent()

        assertEquals(1, repository.authStartCalls.size)
        gate.complete(Result.success(inFlightSession()))
        advanceUntilIdle()
    }

    @Test
    fun confirmSendsTheConfirmActionAndAppliesTheResult() = runTest {
        val repository = FakeAuthUserRepository(
            actionSession = AgentAuthSession(
                sessionId = "auth-1",
                agentId = selectedAgentId,
                status = AuthSessionStatus.Succeeded,
                error = null,
            ),
        )
        val authenticatedWith = mutableListOf<Pair<AgentId, AgentAuthStatus>>()
        val agentAuth = controller(repository, scope = this) { agentId, status ->
            authenticatedWith += agentId to status
        }
        agentAuth.absorbStream(
            selectedAgentId,
            auth(AgentAuthStatus.NeedsAuth, session = inFlightSession()),
        )

        agentAuth.confirm(selectedAgentId, stepId = "step-1")
        advanceUntilIdle()

        assertEquals(
            listOf(Triple(selectedAgentId, "auth-1", AuthSessionAction.Confirm(stepId = "step-1"))),
            repository.authActionCalls,
        )
        assertEquals(AgentAuthStatus.Authenticated, agentAuth.state.value.agentAuth?.status)
        assertFalse(agentAuth.state.value.actionBusy)
        assertEquals(
            listOf(selectedAgentId to AgentAuthStatus.Authenticated),
            authenticatedWith,
        )
    }

    @Test
    fun confirmWithoutAnActiveSessionDoesNothing() = runTest {
        val repository = FakeAuthUserRepository()
        val agentAuth = controller(repository, scope = this)

        agentAuth.confirm(selectedAgentId, stepId = "step-1")
        advanceUntilIdle()

        assertTrue(repository.authActionCalls.isEmpty())
    }

    @Test
    fun cancelSendsTheCancelActionThenRehydrates() = runTest {
        val repository = FakeAuthUserRepository(
            auth = auth(AgentAuthStatus.NeedsAuth, session = inFlightSession()),
            actionSession = AgentAuthSession(
                sessionId = "auth-1",
                agentId = selectedAgentId,
                status = AuthSessionStatus.Cancelled,
                error = null,
            ),
        )
        val agentAuth = controller(repository, scope = this)
        agentAuth.hydrate(selectedAgentId)
        val getsBefore = repository.authGetCalls.size

        agentAuth.cancel(selectedAgentId)
        advanceUntilIdle()

        assertEquals(
            listOf(Triple(selectedAgentId, "auth-1", AuthSessionAction.Cancel)),
            repository.authActionCalls,
        )
        assertEquals(getsBefore + 1, repository.authGetCalls.size)
        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)
        assertFalse(agentAuth.state.value.actionBusy)
    }

    @Test
    fun logoutRequiresASummaryThatAllowsIt() = runTest {
        val repository = FakeAuthUserRepository()
        val agentAuth = controller(repository, scope = this)

        agentAuth.logout(selectedAgentId)
        advanceUntilIdle()

        assertTrue(repository.authLogoutCalls.isEmpty())
    }

    @Test
    fun logoutClearsTheAgentAuthAndReportsTheSummary() = runTest {
        val repository = FakeAuthUserRepository()
        val agentAuth = controller(repository, scope = this)
        agentAuth.mergeSummaries(
            mapOf(
                selectedAgentId to AgentAuthSummary(
                    status = AgentAuthStatus.Authenticated,
                    error = null,
                    activeSessionId = null,
                    canLogout = true,
                ),
            ),
        )
        // The session switch seeded the panel from the cached summary.
        agentAuth.resetFor(selectedAgentId)
        assertEquals(AgentAuthStatus.Authenticated, agentAuth.state.value.summary?.status)

        agentAuth.logout(selectedAgentId)
        advanceUntilIdle()

        assertEquals(listOf(selectedAgentId), repository.authLogoutCalls)
        assertEquals(AgentAuthStatus.NeedsAuth, agentAuth.state.value.agentAuth?.status)
        assertNull(agentAuth.state.value.agentAuth?.session)
        assertFalse(agentAuth.state.value.actionBusy)
        assertNull(agentAuth.state.value.error)
    }

    private fun inFlightSession() = AgentAuthSession(
        sessionId = "auth-1",
        agentId = selectedAgentId,
        status = AuthSessionStatus.InProgress,
        error = null,
    )

    private fun auth(
        status: AgentAuthStatus,
        agentId: AgentId = selectedAgentId,
        session: AgentAuthSession? = null,
    ) = AgentAuth(
        agentId = agentId,
        status = status,
        error = null,
        session = session,
    )

    private class FakeAuthUserRepository(
        var auth: AgentAuth = AgentAuth(
            agentId = "cursor",
            status = AgentAuthStatus.Unknown,
            error = null,
            session = null,
        ),
        var authFailure: Throwable? = null,
        var startSession: AgentAuthSession? = null,
        var actionSession: AgentAuthSession? = null,
        var logoutSummary: AgentAuthSummary = AgentAuthSummary(
            status = AgentAuthStatus.NeedsAuth,
            error = null,
            activeSessionId = null,
            canLogout = false,
        ),
    ) : UserRepository {
        val authGetCalls = mutableListOf<String>()
        val authStartCalls = mutableListOf<String>()
        val authActionCalls =
            mutableListOf<Triple<String, String, AuthSessionAction>>()
        val authLogoutCalls = mutableListOf<String>()

        /** Hold getAgentAuth calls until the test releases them, one gate per call. */
        val gates = ArrayDeque<CompletableDeferred<Result<AgentAuth>>>()
        val startGates = ArrayDeque<CompletableDeferred<Result<AgentAuthSession>>>()

        override suspend fun getAgentAuth(
            serverOrigin: String,
            agentId: AgentId,
        ): Result<AgentAuth> {
            authGetCalls += agentId
            gates.removeFirstOrNull()?.let { gate -> return gate.await() }
            authFailure?.let { return Result.failure(it) }
            return Result.success(auth.copy(agentId = agentId))
        }

        override suspend fun startAgentAuthSession(
            serverOrigin: String,
            agentId: AgentId,
        ): Result<AgentAuthSession> {
            authStartCalls += agentId
            startGates.removeFirstOrNull()?.let { gate -> return gate.await() }
            val session = startSession ?: return Result.failure(UnsupportedOperationException())
            return Result.success(session.copy(agentId = agentId))
        }

        override suspend fun applyAgentAuthSessionAction(
            serverOrigin: String,
            agentId: AgentId,
            sessionId: String,
            action: AuthSessionAction,
        ): Result<AgentAuthSession> {
            authActionCalls += Triple(agentId, sessionId, action)
            val session = actionSession ?: return Result.failure(UnsupportedOperationException())
            return Result.success(session.copy(agentId = agentId))
        }

        override suspend fun logoutAgentAuth(
            serverOrigin: String,
            agentId: AgentId,
        ): Result<AgentAuthSummary> {
            authLogoutCalls += agentId
            return Result.success(logoutSummary)
        }

        override suspend fun listWorkspaces(
            serverOrigin: String,
            limit: Int,
        ) = Result.failure<WorkspaceCollection>(UnsupportedOperationException())

        override suspend fun getRuntimeSettings(serverOrigin: String) =
            Result.failure<RuntimeSettingsView>(UnsupportedOperationException())

        override suspend fun listFilesystemDirectories(
            serverOrigin: String,
            root: String,
        ) = Result.failure<FilesystemDirectoryCollection>(UnsupportedOperationException())

        override suspend fun createWorkspace(
            serverOrigin: String,
            body: CreateWorkspaceBody,
        ) = Result.failure<Workspace>(UnsupportedOperationException())

        override suspend fun listSessions(
            serverOrigin: String,
            cwd: String?,
        ) = Result.failure<SessionCollection>(UnsupportedOperationException())

        override suspend fun listAgents(serverOrigin: String) =
            Result.failure<AgentSettingsCollection>(UnsupportedOperationException())

        override suspend fun createSession(
            serverOrigin: String,
            body: CreateSessionBody,
        ) = Result.failure<CreateSessionResponse>(UnsupportedOperationException())

        override suspend fun deleteSession(
            serverOrigin: String,
            agentId: AgentId,
            sessionId: String,
        ) = Result.failure<Unit>(UnsupportedOperationException())

        override suspend fun revokeDevice(
            serverOrigin: String,
            deviceId: String,
        ) = Result.failure<Unit>(UnsupportedOperationException())
    }

    companion object {
        private const val ORIGIN = "http://harold.local:3000"
    }
}
