package harold.android.acp

import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionResponse
import harold.android.process.AgentProcessLauncher
import harold.android.process.SessionFileService
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit

/**
 * The app's live ACP runtime: one agent process per (host identity, agent),
 * reused by chat streams and every management call. Processes are keyed by
 * the SSH pool key so two saved rows for the same host share one agent.
 */
@Singleton
class AgentRuntime @Inject constructor(
    private val launcher: AgentProcessLauncher,
    private val files: SessionFileService,
    private val catalog: AcpSessionCatalog,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Process key: `"${poolKey}|agent=$agentId"`. */
    private val processes = ConcurrentHashMap<String, AgentProcess>()

    /** Saved connection id -> host identity key, kept after the row is removed. */
    private val connections = ConcurrentHashMap<String, String>()

    private val processLocks = ConcurrentHashMap<String, Mutex>()

    suspend fun acquire(connectionId: String, agentId: AgentId): AgentProcess {
        val poolKey = launcher.keyFor(connectionId)
        connections[connectionId] = poolKey
        val processKey = processKey(poolKey, agentId)
        val lock = synchronized(processLocks) {
            processLocks.getOrPut(processKey) { Mutex() }
        }
        return lock.withLock {
            val existing = processes[processKey]
            if (existing != null && !existing.isDead) {
                existing.touch()
                return@withLock existing
            }
            if (existing != null) {
                processes.remove(processKey, existing)
            }
            val channel = launcher.launchAgent(connectionId, agentId).getOrThrow()
            val process = AgentProcess(
                connectionId = connectionId,
                agentId = agentId,
                key = processKey,
                channel = channel,
                launcher = launcher,
                files = files,
                catalog = catalog,
                scope = scope,
                onClosed = ::onProcessClosed,
            )
            try {
                process.start()
            } catch (error: Throwable) {
                channel.close()
                throw error
            }
            if (process.isDead) {
                process.close(intentional = true)
                throw AcpClosedException(process.closedReason ?: "The agent process closed.")
            }
            processes[processKey] = process
            process
        }
    }

    suspend fun openSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        cwd: String? = null,
    ): Result<AcpSession> = runCatching {
        val process = acquire(connectionId, agentId)
        process.openSession(connectionId, sessionId, cwd)
    }

    suspend fun createSession(
        connectionId: String,
        agentId: AgentId,
        cwd: String,
    ): Result<CreateSessionResponse> = runCatching {
        val process = acquire(connectionId, agentId)
        process.sessionNew(connectionId, cwd)
    }

    /**
     * Compiles `session/list` from every enabled agent on the host, reusing
     * warm processes. One broken or slow agent only drops its own rows; the
     * rest still list.
     */
    suspend fun listSessions(
        connectionId: String,
        cwd: String? = null,
    ): Result<List<AcpSessionInfo>> = runCatching {
        val rows = launcher.launchableAgents(connectionId).getOrThrow()
        if (rows.isEmpty()) {
            catalog.replaceAll(connectionId, emptyList())
            return@runCatching emptyList()
        }

        val results = coroutineScope {
            val permits = Semaphore(MAX_CONCURRENT_AGENT_LISTS)
            rows.map { row ->
                async(Dispatchers.IO) {
                    permits.withPermit {
                        row.id to runCatching {
                            val process = acquire(connectionId, row.id)
                            process.sessionList(connectionId, cwd)
                        }.getOrNull()
                    }
                }
            }.awaitAll()
        }

        val refreshedAgents = results
            .mapNotNull { (agentId, sessions) -> agentId.takeIf { sessions != null } }
            .toSet()
        val attemptedAgents = rows.map { row -> row.id }.toSet()
        val sessions = results
            .flatMap { (_, listed) -> listed.orEmpty() }
            .filter { session -> cwd == null || session.cwd == cwd }
        val merged = catalog.merge(
            connectionId = connectionId,
            sessions = sessions,
            refreshedAgentIds = refreshedAgents,
            attemptedAgentIds = attemptedAgents,
            cwd = cwd,
        )
        if (cwd == null) merged else merged.filter { session -> session.cwd == cwd }
    }

    suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = runCatching {
        val process = acquire(connectionId, agentId)
        process.removeSession(connectionId, sessionId)?.close()
        process.sessionDelete(sessionId)
        catalog.remove(connectionId, agentId, sessionId)
    }

    /** Detaches every stream from a session without closing its process. */
    fun closeSession(connectionId: String, agentId: AgentId, sessionId: String) {
        findSession(connectionId, agentId, sessionId)?.detachAll()
    }

    /** Closes the process so the next open performs a fresh handshake. */
    suspend fun restart(connectionId: String, agentId: AgentId): Result<Unit> = runCatching {
        val poolKey = launcher.keyFor(connectionId)
        connections[connectionId] = poolKey
        val process = processes.remove(processKey(poolKey, agentId))
        if (process != null) {
            process.close(intentional = true)
        }
    }

    fun capabilities(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): AgentCapabilityInventory? {
        findSession(connectionId, agentId, sessionId)?.let { session ->
            return session.capabilityInventory
        }
        val poolKey = connections[connectionId] ?: return null
        return processes[processKey(poolKey, agentId)]?.capabilities
    }

    fun findSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): AcpSession? {
        val poolKey = connections[connectionId]
        if (poolKey != null) {
            val process = processes[processKey(poolKey, agentId)] ?: return null
            if (process.isDead) {
                return null
            }
            return process.findSession(connectionId, sessionId)
        }
        // The row may have been remembered by an earlier acquire; fall back
        // to the session's own connection id instead of the process owner.
        return liveProcesses()
            .flatMap { process -> process.sessions.values.toList() }
            .firstOrNull { session ->
                session.connectionId == connectionId &&
                    session.agentId == agentId &&
                    session.sessionId == sessionId &&
                    !session.isClosed
            }
    }

    fun findSessionByRequest(requestId: String): AcpSession? =
        liveProcesses()
            .flatMap { process -> process.sessions.values.toList() }
            .firstOrNull { session ->
                session.hasPermission(requestId) || session.hasElicitation(requestId)
            }

    /** The host identity key last used by a saved connection, if any. */
    fun rememberedPoolKey(connectionId: String): String? = connections[connectionId]

    /**
     * Closes every process for the host identity behind a saved connection.
     * Uses the remembered key so removal still works after the row is gone.
     */
    suspend fun closeConnection(connectionId: String) {
        val poolKey = connections.remove(connectionId)
            ?: runCatching { launcher.keyFor(connectionId) }.getOrNull()
            ?: return
        processes.values
            .filter { process -> process.key.startsWith("$poolKey|agent=") }
            .forEach { process -> process.close(intentional = true) }
    }

    /** Closes processes with no attached stream and no running prompt. */
    fun onBackground() {
        idleProcesses { _ -> true }.forEach { process -> process.close(intentional = true) }
    }

    /** Closes idle processes whose last use is older than [idleMillis]. */
    fun trimIdle(idleMillis: Long = DEFAULT_IDLE_MILLIS) {
        val now = System.nanoTime()
        val idleNanos = TimeUnit.MILLISECONDS.toNanos(idleMillis)
        idleProcesses { process -> now - process.lastUsedNanos >= idleNanos }
            .forEach { process -> process.close(intentional = true) }
    }

    private fun idleProcesses(predicate: (AgentProcess) -> Boolean): List<AgentProcess> =
        processes.values.filter { process ->
            !process.isDead && !process.hasWork() && predicate(process)
        }

    private fun liveProcesses(): List<AgentProcess> =
        processes.values.filter { process -> !process.isDead }

    private fun onProcessClosed(process: AgentProcess) {
        processes.remove(process.key, process)
    }

    private fun processKey(poolKey: String, agentId: AgentId): String =
        "$poolKey|agent=$agentId"

    companion object {
        const val DEFAULT_IDLE_MILLIS: Long = 10 * 60 * 1000L
        private const val MAX_CONCURRENT_AGENT_LISTS = 4
    }
}
