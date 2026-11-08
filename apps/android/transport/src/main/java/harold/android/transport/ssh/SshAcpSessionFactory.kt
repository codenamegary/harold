package harold.android.transport.ssh

import harold.android.contracts.CreateSessionResponse
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshConfig
import harold.android.transport.acp.AcpClient
import harold.android.transport.acp.AcpClientHandler
import harold.android.transport.acp.AcpRemoteException
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Singleton
class SshAcpSessionFactory @Inject constructor(
    private val savedConnections: ConnectionRepository,
    private val connectionFactory: SshConnectionFactory,
    private val registry: SshAcpRegistry,
    private val catalog: SshSessionCatalog,
) {
    suspend fun open(
        connectionId: String,
        agentId: String,
        sessionId: String,
        scope: CoroutineScope,
    ): Result<SshAcpSession> = runCatching {
        val config = sshConfig(connectionId)
        val connection = connectionFactory.connect(config)
        try {
            val home = connection.realPath(".")
            val store = SshSessionStore(connection, home)
            // The catalog supplies cwd and title without a per-session file.
            // When it has nothing (cold start), start() asks the agent for
            // session/list before it calls session/load.
            val info = catalog.find(connectionId, agentId, sessionId)
            val launch = agentCommand(connection, store, agentId)
            val exec = connection.exec(launch.command)
            val session = SshAcpSession(
                connectionId = connectionId,
                agentId = agentId,
                sessionId = sessionId,
                initialInfo = info,
                connection = connection,
                exec = exec,
                scope = scope,
                registry = registry,
                catalog = catalog,
            )
            try {
                session.start()
            } catch (error: Throwable) {
                session.close()
                throw error
            }
            registry.register(session)
            session
        } catch (error: Throwable) {
            connection.close()
            throw error
        }
    }

    suspend fun createSession(
        connectionId: String,
        agentId: String,
        cwd: String,
    ): Result<CreateSessionResponse> = useConnection(connectionId) { connection, store ->
        val launch = agentCommand(connection, store, agentId)
        withAgentProcess(connection, launch) { client ->
            client.request(
                method = "initialize",
                params = acpInitializeParams(),
            )
            val response = try {
                client.request(
                    method = "session/new",
                    params = buildJsonObject {
                        put("cwd", cwd)
                        put("mcpServers", buildJsonArray { })
                    },
                    timeoutMillis = 180_000,
                )
            } catch (error: AcpRemoteException) {
                if (isAcpAuthRequiredError(error.code, error.message)) {
                    throw SshAuthRequiredException(agentId, error.message)
                }
                throw error
            }
            val sessionId = response.string("sessionId")
                ?: throw SshException("The agent did not return a session id.")
            val responseObject = response as? JsonObject
            val configOptions = (responseObject?.get("configOptions") as? JsonArray)
                ?.map { element: JsonElement -> element }
                .orEmpty()
            val now = Instant.now().toString()
            catalog.upsert(
                connectionId = connectionId,
                session = AcpSessionInfo(
                    agentId = agentId,
                    sessionId = sessionId,
                    cwd = cwd,
                    title = NEW_SESSION_TITLE,
                    updatedAt = now,
                ),
            )
            CreateSessionResponse(
                agentId = agentId,
                sessionId = sessionId,
                cwd = cwd,
                title = NEW_SESSION_TITLE,
                updatedAt = now,
                configOptions = configOptions,
            )
        }
    }

    /**
     * Compiles `session/list` from every enabled agent on the host. One
     * broken or slow agent only drops its own rows; the rest still list.
     */
    suspend fun listSessions(
        connectionId: String,
        cwd: String? = null,
    ): Result<List<AcpSessionInfo>> = useConnection(connectionId) { connection, store ->
        val rows = ensureAgentRows(connection, store)
            .filter { row -> row.enabled && !row.dismissed && (row.present || row.path != null) }
        if (rows.isEmpty()) {
            catalog.replaceAll(connectionId, emptyList())
            return@useConnection emptyList()
        }

        val results = coroutineScope {
            val permits = Semaphore(MAX_CONCURRENT_AGENT_LISTS)
            rows.map { row ->
                async(Dispatchers.IO) {
                    permits.withPermit {
                        row.id to runCatching {
                            listAgentSessions(connection, row, cwd)
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
        agentId: String,
        sessionId: String,
    ): Result<Unit> = runCatching {
        registry.find(connectionId, agentId, sessionId)?.close()
        useConnection(connectionId) { connection, store ->
            val launch = agentCommand(connection, store, agentId)
            withAgentProcess(connection, launch) { client ->
                val initialize = client.request(
                    method = "initialize",
                    params = acpInitializeParams(),
                )
                if (!initialize.advertisesSessionCapability("delete")) {
                    throw SshException(
                        "$agentId does not support session/delete. " +
                            "Remove this session with the agent's CLI on the host.",
                    )
                }
                try {
                    client.request(
                        method = "session/delete",
                        params = buildJsonObject { put("sessionId", sessionId) },
                    )
                } catch (error: AcpRemoteException) {
                    // ACP defines -32002 as "already gone": that is success.
                    if (error.code != -32002) {
                        throw error
                    }
                }
            }
        }.getOrThrow()
        catalog.remove(connectionId, agentId, sessionId)
    }

    suspend fun <T> useConnection(
        connectionId: String,
        block: suspend (SshConnection, SshSessionStore) -> T,
    ): Result<T> = runCatching {
        val config = sshConfig(connectionId)
        val connection = connectionFactory.connect(config)
        try {
            val home = connection.realPath(".")
            block(connection, SshSessionStore(connection, home))
        } finally {
            connection.close()
        }
    }

    /**
     * Reads every page of one agent's session list. Agents that do not
     * advertise `sessionCapabilities.list` are skipped without a failed
     * process leaking into the aggregate.
     */
    private suspend fun listAgentSessions(
        connection: SshConnection,
        row: HostAgentConfigRow,
        cwd: String?,
    ): List<AcpSessionInfo> = withAgentProcess(
        connection,
        agentCommand(connection, row, row.id),
    ) { client ->
        val initialize = client.request(
            method = "initialize",
            params = acpInitializeParams(),
        )
        if (!initialize.advertisesSessionCapability("list")) {
            return@withAgentProcess emptyList()
        }
        val sessions = mutableListOf<AcpSessionInfo>()
        val seenCursors = mutableSetOf<String>()
        var cursor: String? = null
        var pages = 0
        while (pages < MAX_SESSION_LIST_PAGES) {
            pages += 1
            val response = client.request(
                method = "session/list",
                params = acpSessionListParams(cwd, cursor),
                timeoutMillis = SESSION_LIST_TIMEOUT_MILLIS,
            )
            val page = parseSessionListPage(row.id, response)
            sessions += page.sessions
            val next = page.nextCursor ?: break
            if (!seenCursors.add(next)) {
                break
            }
            cursor = next
        }
        sessions.filter { session -> cwd == null || session.cwd == cwd }
    }

    /**
     * Starts one short-lived ACP process and hands the uninitialized client
     * to [block]. The process and its SSH channel are always closed. A
     * process that exits before the handshake turns into an actionable
     * launch error with the host's stderr instead of a transport failure.
     */
    private suspend fun <T> withAgentProcess(
        connection: SshConnection,
        launch: AgentLaunch,
        block: suspend (AcpClient) -> T,
    ): T {
        val exec = connection.exec(launch.command)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val client = AcpClient(
            input = exec.stdout,
            output = exec.stdin,
            scope = scope,
            handler = NoClientRequests,
        )
        client.start()
        return try {
            block(client)
        } catch (error: SshAuthRequiredException) {
            throw error
        } catch (error: AcpRemoteException) {
            throw error
        } catch (error: Throwable) {
            val stderr = exec.stderrText().trim()
            if (!exec.isClosed() && stderr.isEmpty()) {
                throw error
            }
            val detail = stderr.ifBlank { error.message ?: "the ACP process closed." }
            throw SshAgentLaunchException(
                "${launch.label} failed to start: ${detail.take(MAX_LAUNCH_DETAIL)}",
                error,
            )
        } finally {
            client.close()
            exec.close()
            scope.cancel()
        }
    }

    private suspend fun ensureAgentRows(
        connection: SshConnection,
        store: SshSessionStore,
    ): List<HostAgentConfigRow> {
        store.readAgentsConfig()?.let { rows -> return rows }
        val scanned = scanAgentRows(connection, emptyList())
        store.writeAgentsConfig(scanned)
        return scanned
    }

    private suspend fun sshConfig(connectionId: String): SshConfig =
        savedConnections.find(connectionId)?.ssh
            ?: throw SshException("Saved connection not found: $connectionId")

    /**
     * Builds the launch command from the agent's saved settings:
     * `<path or known binary> <args...>`. A disabled or dismissed agent
     * cannot start. A saved path that no longer runs fails before the SSH
     * exec with a message that names the path.
     */
    private suspend fun agentCommand(
        connection: SshConnection,
        store: SshSessionStore,
        agentId: String,
    ): AgentLaunch = agentCommand(
        connection = connection,
        row = store.agentsConfig().find { it.id == agentId },
        agentId = agentId,
    )

    private suspend fun agentCommand(
        connection: SshConnection,
        row: HostAgentConfigRow?,
        agentId: String,
    ): AgentLaunch {
        if (row?.dismissed == true) {
            throw SshException("$agentId was removed from this host's agent list.")
        }
        if (row?.enabled == false) {
            throw SshException("$agentId is disabled. Enable it in the Agents screen.")
        }
        val label = agentDisplayName(agentId, row)
        val explicitPath = row?.path?.takeIf { path -> path.isNotBlank() }
        if (explicitPath != null && !connection.isExecutable(explicitPath)) {
            throw SshAgentLaunchException(
                "$label is not executable at $explicitPath. " +
                    "Update its path in Agents or rescan the host.",
            )
        }
        val known = knownAgent(agentId)
        val binary = explicitPath
            ?: known?.command?.firstOrNull()
            ?: agentId
        val args = if (explicitPath != null) {
            row.args
        } else {
            known?.command?.drop(1).orEmpty()
        }
        val command = "exec " + (listOf(binary) + args)
            .joinToString(" ") { token -> SshSessionStore.shellQuote(token) }
        return AgentLaunch(
            label = label,
            command = "exec bash -lc ${SshSessionStore.shellQuote(command)}",
        )
    }

    private data class AgentLaunch(
        val label: String,
        val command: String,
    )

    private object NoClientRequests : AcpClientHandler {
        override suspend fun onNotification(method: String, params: JsonElement) = Unit

        override suspend fun onRequest(id: String, method: String, params: JsonElement): JsonElement =
            throw UnsupportedOperationException("$method is not available in a management process")
    }

    companion object {
        const val NEW_SESSION_TITLE: String = "New session"
        private const val MAX_SESSION_LIST_PAGES = 100
        private const val MAX_CONCURRENT_AGENT_LISTS = 4
        private const val SESSION_LIST_TIMEOUT_MILLIS = 60_000L
        private const val MAX_LAUNCH_DETAIL = 500
    }
}

private fun JsonElement.string(key: String): String? =
    ((this as? JsonObject)?.get(key) as? JsonPrimitive)?.content
