package harold.android.chat

import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.database.session.SessionCatalog
import harold.android.database.session.SessionListItem
import harold.android.database.session.SessionRepository
import harold.android.network.AgentSessionSnapshot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionCatalogRefresherTest {
    private val connection = "ssh://gary@host"

    @Test
    fun concurrentRefreshesShareOneNetworkScan() = runTest {
        val repository = GatedSessionRepository()
        val refresher = SessionCatalogRefresher(repository)
        repository.gate = CompletableDeferred()

        val first = async {
            refresher.refresh(connection, SessionRefreshTrigger.ConnectionChanged)
        }
        val second = async {
            refresher.refresh(connection, SessionRefreshTrigger.Foreground)
        }
        runCurrent()
        repository.gate?.complete(Unit)

        val outcomes = listOf(first.await(), second.await())

        assertEquals(1, repository.refreshes)
        assertTrue(outcomes.all { outcome -> outcome.isSuccess })
        assertTrue(outcomes.first().getOrThrow().refreshed)
        assertFalse(outcomes.last().getOrThrow().refreshed)
    }

    @Test
    fun freshCatalogSkipsTheNetwork() = runTest {
        val repository = GatedSessionRepository()
        val refresher = SessionCatalogRefresher(repository)
        refresher.nowMillis = { 1_000L }

        assertTrue(refresher.refresh(connection, SessionRefreshTrigger.AppStart).getOrThrow().refreshed)

        refresher.nowMillis = { 11_000L }
        val second = refresher.refresh(connection, SessionRefreshTrigger.AppStart).getOrThrow()

        assertFalse(second.refreshed)
        assertEquals(1, repository.refreshes)
    }

    @Test
    fun staleCatalogRefreshesAfterTheTtl() = runTest {
        val repository = GatedSessionRepository()
        val refresher = SessionCatalogRefresher(repository)
        refresher.nowMillis = { 1_000L }
        refresher.refresh(connection, SessionRefreshTrigger.AppStart)

        refresher.nowMillis = { 62_000L }
        val second = refresher.refresh(connection, SessionRefreshTrigger.AppStart).getOrThrow()

        assertTrue(second.refreshed)
        assertEquals(2, repository.refreshes)
    }

    @Test
    fun forceTriggerRefreshesEvenWhenFresh() = runTest {
        val repository = GatedSessionRepository()
        val refresher = SessionCatalogRefresher(repository)
        refresher.nowMillis = { 1_000L }
        refresher.refresh(connection, SessionRefreshTrigger.AppStart)

        val second = refresher.refresh(connection, SessionRefreshTrigger.ConnectionChanged).getOrThrow()

        assertTrue(second.refreshed)
        assertEquals(2, repository.refreshes)
    }

    @Test
    fun skippedRefreshReturnsTheCatalogFromTheLastScan() = runTest {
        val repository = GatedSessionRepository()
        val catalog = SessionCatalog(authoritative = false, error = "cursor needs login")
        repository.catalog = catalog
        val refresher = SessionCatalogRefresher(repository)
        refresher.nowMillis = { 1_000L }
        refresher.refresh(connection, SessionRefreshTrigger.AppStart)

        refresher.nowMillis = { 2_000L }
        val second = refresher.refresh(connection, SessionRefreshTrigger.AppStart).getOrThrow()

        assertFalse(second.refreshed)
        assertSame(catalog, second.catalog)
    }

    @Test
    fun failedRefreshIsRetriedNextTime() = runTest {
        val repository = GatedSessionRepository()
        repository.failNext = true
        val refresher = SessionCatalogRefresher(repository)
        refresher.nowMillis = { 1_000L }

        assertTrue(refresher.refresh(connection, SessionRefreshTrigger.AppStart).isFailure)

        refresher.nowMillis = { 2_000L }
        assertTrue(refresher.refresh(connection, SessionRefreshTrigger.AppStart).isSuccess)
        assertEquals(2, repository.refreshes)
    }
}

private class GatedSessionRepository : SessionRepository {
    var refreshes = 0
    var gate: CompletableDeferred<Unit>? = null
    var failNext = false
    var catalog = SessionCatalog()

    override fun observeSessions(): Flow<List<SessionListItem>> = emptyFlow()

    override fun observeSessions(connectionId: String): Flow<List<SessionListItem>> = emptyFlow()

    override fun observeSnapshots(): Flow<List<AgentSessionSnapshot>> = emptyFlow()

    override suspend fun refresh(connectionId: String): Result<SessionCatalog> {
        refreshes += 1
        gate?.await()
        if (failNext) {
            failNext = false
            return Result.failure(IllegalStateException("offline"))
        }
        return Result.success(catalog)
    }

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = error("unused")

    override suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = error("unused")

    override suspend fun updateWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ) = error("unused")
}
