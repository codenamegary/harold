package harold.android.acp

import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionResponse
import harold.android.network.CatalogSession
import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessLauncher
import harold.android.process.SessionFileService
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
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

    /**
     * Last known working directories. The catalog drops an agent's rows when
     * its process dies, but a watched session still needs a cwd hint to
     * `session/load` on the replacement process.
     */
    private val sessionCwds = ConcurrentHashMap<SessionKey, String>()

    private val processLocks = ConcurrentHashMap<String, Mutex>()

    /** Consecutive attach failures per session, cleared by a successful attach. */
    private val attachFailures = ConcurrentHashMap<SessionKey, Int>()

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
                poolKey = poolKey,
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
        withProcess(connectionId, agentId) { process ->
            val key = SessionKey(connectionId, agentId, sessionId)
            val session = process.openSession(
                connectionId = connectionId,
                sessionId = sessionId,
                cwdHint = cwd ?: sessionCwds[key],
            )
            sessionCwds[key] = session.cwd
            session
        }
    }

    suspend fun createSession(
        connectionId: String,
        agentId: AgentId,
        cwd: String,
    ): Result<CreateSessionResponse> = runCatching {
        withProcess(connectionId, agentId) { process ->
            process.sessionNew(connectionId, cwd).also { created ->
                sessionCwds[SessionKey(connectionId, agentId, created.sessionId)] = created.cwd
            }
        }
    }

    /**
     * Records a failed stream attach. The in-memory session is discarded so
     * the next attach builds a fresh one. Repeated failures also restart the
     * warm agent process, because a process stuck mid-load cannot be fixed by
     * reusing it.
     */
    suspend fun sessionAttachFailed(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) {
        val key = SessionKey(connectionId, agentId, sessionId)
        val failures = attachFailures.merge(key, 1, Int::plus) ?: 1
        val poolKey = connections[connectionId]
        val process = poolKey?.let { key -> processes[processKey(key, agentId)] }
        process?.removeSession(connectionId, sessionId)?.close()
        if (failures >= ATTACH_FAILURES_BEFORE_PROCESS_RESTART) {
            attachFailures.remove(key)
            restart(connectionId, agentId).getOrNull()
        }
    }

    /** Clears the attach failure streak once a stream reaches `subscribed`. */
    fun sessionAttachSucceeded(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) {
        attachFailures.remove(SessionKey(connectionId, agentId, sessionId))
    }

    /**
     * Compiles `session/list` from every enabled agent on the host, reusing
     * warm processes. Each agent's snapshot lands as soon as that agent
     * answers, so one slow or broken agent only holds up its own rows.
     */
    suspend fun listSessions(
        connectionId: String,
        cwd: String? = null,
    ): Result<List<AcpSessionInfo>> = runCatching {
        val rows = launcher.launchableAgents(connectionId).getOrThrow()
        catalog.retainAgents(connectionId, rows.map { row -> row.id }.toSet())
        if (rows.isEmpty()) {
            return@runCatching emptyList()
        }

        catalog.markLoading(connectionId, rows.map { row -> row.id })
        coroutineScope {
            val permits = Semaphore(MAX_CONCURRENT_AGENT_LISTS)
            rows.map { row ->
                async(Dispatchers.IO) {
                    permits.withPermit {
                        runCatching {
                            withProcess(connectionId, row.id) { process ->
                                process.sessionList(connectionId, cwd)
                            }
                        }.fold(
                            onSuccess = { sessions ->
                                catalog.replaceAgent(connectionId, row.id, sessions, cwd)
                            },
                            onFailure = { error ->
                                catalog.markFailed(
                                    connectionId = connectionId,
                                    agentId = row.id,
                                    message = listFailureMessage(error),
                                )
                            },
                        )
                    }
                }
            }.awaitAll()
        }

        catalog.sessions(connectionId)
            .filter { session -> cwd == null || session.cwd == cwd }
            .map { session -> session.toSessionInfo() }
    }

    suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = runCatching {
        withProcess(connectionId, agentId) { process ->
            process.removeSession(connectionId, sessionId)?.close()
            process.sessionDelete(sessionId)
        }
        catalog.remove(connectionId, agentId, sessionId)
        val key = SessionKey(connectionId, agentId, sessionId)
        sessionCwds.remove(key)
        attachFailures.remove(key)
    }

    /** Detaches every stream from a session without closing its process. */
    fun closeSession(connectionId: String, agentId: AgentId, sessionId: String) {
        findSession(connectionId, agentId, sessionId)?.detachAll()
    }

    /** Closes the process so the next open performs a fresh handshake. */
    suspend fun restart(connectionId: String, agentId: AgentId): Result<Unit> = runCatching {
        val poolKey = launcher.keyFor(connectionId)
        connections[connectionId] = poolKey
        attachFailures.keys.removeAll { key ->
            key.connectionId == connectionId && key.agentId == agentId
        }
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
            .filter { process -> process.poolKey == poolKey }
            .forEach { process -> process.close(intentional = true) }
        catalog.removeConnection(connectionId)
        sessionCwds.keys.removeAll { key -> key.connectionId == connectionId }
        attachFailures.keys.removeAll { key -> key.connectionId == connectionId }
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
        connections
            .filterValues { poolKey -> poolKey == process.poolKey }
            .keys
            .forEach { connectionId -> catalog.removeAgent(connectionId, process.agentId) }
    }

    private fun processKey(poolKey: String, agentId: AgentId): String =
        "$poolKey|agent=$agentId"

    /**
     * Runs [block] on the warm process. A write failure means the stdio pipe
     * is gone but the host process may still be alive, so drop it and retry
     * once on a fresh process.
     */
    private suspend fun <T> withProcess(
        connectionId: String,
        agentId: AgentId,
        block: suspend (AgentProcess) -> T,
    ): T {
        try {
            return block(acquire(connectionId, agentId))
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            if (!error.canReplaceProcess()) {
                throw error
            }
        }
        restart(connectionId, agentId).getOrNull()
        return block(acquire(connectionId, agentId))
    }

    private fun Throwable.canReplaceProcess(): Boolean =
        this is IOException || this is AcpClosedException

    private fun listFailureMessage(error: Throwable): String = when (error) {
        is AgentAuthRequiredException -> "Sign in on the host to list this agent's sessions."
        is AgentLaunchException -> error.message
            ?.takeIf { message -> message.isNotBlank() }
            ?: "This agent failed to start."
        is AcpRemoteException -> error.message
            ?.takeIf { message -> message.isNotBlank() }
            ?: "The agent rejected the session list request."
        is AcpClosedException -> "The agent process closed. Try again."
        else -> "Could not list this agent's sessions. Try again."
    }

    companion object {
        const val DEFAULT_IDLE_MILLIS: Long = 10 * 60 * 1000L
        private const val MAX_CONCURRENT_AGENT_LISTS = 4
        private const val ATTACH_FAILURES_BEFORE_PROCESS_RESTART = 2
    }
}

private fun CatalogSession.toSessionInfo(): AcpSessionInfo = AcpSessionInfo(
    agentId = agentId,
    sessionId = sessionId,
    cwd = cwd,
    title = title.takeIf { it.isNotBlank() },
    updatedAt = updatedAt.takeIf { it.isNotBlank() },
    additionalDirectories = additionalDirectories,
)

private data class SessionKey(
    val connectionId: String,
    val agentId: AgentId,
    val sessionId: String,
)
