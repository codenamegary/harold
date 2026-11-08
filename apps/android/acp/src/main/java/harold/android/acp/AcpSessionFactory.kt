package harold.android.acp

import harold.android.contracts.CreateSessionResponse
import harold.android.network.isAcpAuthRequiredError
import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessChannel
import harold.android.process.AgentProcessLauncher
import harold.android.process.LaunchableAgent
import harold.android.process.SessionFileService
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
class AcpSessionFactory @Inject constructor(
    private val launcher: AgentProcessLauncher,
    private val registry: AcpSessionRegistry,
    private val catalog: AcpSessionCatalog,
    private val files: SessionFileService,
) {
    suspend fun open(
        connectionId: String,
        agentId: String,
        sessionId: String,
        scope: CoroutineScope,
    ): Result<AcpSession> = runCatching {
        val channel = launcher.launchAgent(connectionId, agentId).getOrThrow()
        try {
            // The catalog supplies cwd and title without a per-session file.
            // When it has nothing (cold start), start() asks the agent for
            // session/list before it calls session/load.
            val info = catalog.find(connectionId, agentId, sessionId)
            val session = AcpSession(
                connectionId = connectionId,
                agentId = agentId,
                sessionId = sessionId,
                initialInfo = info,
                channel = channel,
                launcher = launcher,
                files = files,
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
            channel.close()
            throw error
        }
    }

    suspend fun createSession(
        connectionId: String,
        agentId: String,
        cwd: String,
    ): Result<CreateSessionResponse> = runCatching {
        val channel = launcher.launchAgent(connectionId, agentId).getOrThrow()
        withAgentProcess(channel) { client ->
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
                    throw AgentAuthRequiredException(agentId, error.message)
                }
                throw error
            }
            val sessionId = response.string("sessionId")
                ?: throw IllegalStateException("The agent did not return a session id.")
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
                            listAgentSessions(connectionId, row, cwd)
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
        val channel = launcher.launchAgent(connectionId, agentId).getOrThrow()
        withAgentProcess(channel) { client ->
            val initialize = client.request(
                method = "initialize",
                params = acpInitializeParams(),
            )
            if (!initialize.advertisesSessionCapability("delete")) {
                throw IllegalStateException(
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
        catalog.remove(connectionId, agentId, sessionId)
    }

    /**
     * Reads every page of one agent's session list. Agents that do not
     * advertise `sessionCapabilities.list` are skipped without a failed
     * process leaking into the aggregate.
     */
    private suspend fun listAgentSessions(
        connectionId: String,
        row: LaunchableAgent,
        cwd: String?,
    ): List<AcpSessionInfo> {
        val channel = launcher.launchAgent(connectionId, row.id).getOrThrow()
        return withAgentProcess(channel) { client ->
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
    }

    /**
     * Starts one short-lived ACP process and hands the uninitialized client
     * to [block]. The process channel is always closed. A process that exits
     * before the handshake turns into an actionable launch error with the
     * host's stderr instead of a transport failure.
     */
    private suspend fun <T> withAgentProcess(
        channel: AgentProcessChannel,
        block: suspend (AcpClient) -> T,
    ): T {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val client = AcpClient(
            input = channel.stdout,
            output = channel.stdin,
            scope = scope,
            handler = NoClientRequests,
        )
        client.start()
        return try {
            block(client)
        } catch (error: AgentAuthRequiredException) {
            throw error
        } catch (error: AcpRemoteException) {
            throw error
        } catch (error: Throwable) {
            val stderr = channel.stderrText().trim()
            if (!channel.isClosed() && stderr.isEmpty()) {
                throw error
            }
            val detail = stderr.ifBlank { error.message ?: "the ACP process closed." }
            val label = channel.label.ifBlank { "The agent" }
            throw AgentLaunchException(
                "$label failed to start: ${detail.take(MAX_LAUNCH_DETAIL)}",
                error,
            )
        } finally {
            client.close()
            channel.close()
            scope.cancel()
        }
    }

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
