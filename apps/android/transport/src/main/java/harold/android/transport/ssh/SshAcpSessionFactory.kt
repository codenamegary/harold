package harold.android.transport.ssh

import harold.android.contracts.CreateSessionResponse
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshConfig
import harold.android.transport.acp.AcpClient
import harold.android.transport.acp.AcpClientHandler
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
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
            val metadata = store.readSession(agentId, sessionId)
                ?: throw SshException("No session metadata for $agentId/$sessionId.")
            val lock = store.acquireLock(agentId, sessionId).getOrThrow()
            val exec = try {
                connection.exec(agentCommand(agentId))
            } catch (error: Throwable) {
                lock.close()
                throw error
            }
            val session = SshAcpSession(
                connectionId = connectionId,
                agentId = agentId,
                sessionId = sessionId,
                metadata = metadata,
                store = store,
                connection = connection,
                exec = exec,
                lock = lock,
                scope = scope,
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
        deviceName: String,
    ): Result<CreateSessionResponse> = useConnection(connectionId) { connection, store ->
        val exec = connection.exec(agentCommand(agentId))
        val client = AcpClient(
            input = exec.stdout,
            output = exec.stdin,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
            handler = NoClientRequests,
        )
        client.start()
        try {
            client.request(
                method = "initialize",
                params = buildJsonObject {
                    put("protocolVersion", 1)
                    put(
                        "clientCapabilities",
                        buildJsonObject {
                            put(
                                "fs",
                                buildJsonObject {
                                    put("readTextFile", true)
                                    put("writeTextFile", true)
                                },
                            )
                            put("terminal", true)
                        },
                    )
                    put(
                        "clientInfo",
                        buildJsonObject {
                            put("name", "Harold Android")
                            put("version", "android")
                        },
                    )
                },
            )
            val response = client.request(
                method = "session/new",
                params = buildJsonObject {
                    put("cwd", cwd)
                    put("mcpServers", buildJsonArray { })
                },
                timeoutMillis = 180_000,
            )
            val sessionId = response.string("sessionId")
                ?: throw SshException("The agent did not return a session id.")
            val responseObject = response as? JsonObject
            val configOptions = (responseObject?.get("configOptions") as? kotlinx.serialization.json.JsonArray)
                ?.map { element: JsonElement -> element }
                .orEmpty()
            val now = Instant.now().toString()
            val metadata = HostSessionMetadata(
                agent = agentId,
                sessionId = sessionId,
                cwd = cwd,
                title = "New session",
                deviceName = deviceName,
                createdAt = now,
                lastUsedAt = now,
            )
            store.writeSession(metadata)
            store.rememberWorkspace(cwd, cwd.substringAfterLast('/').ifBlank { cwd })
            CreateSessionResponse(
                agentId = agentId,
                sessionId = sessionId,
                cwd = cwd,
                title = metadata.title,
                updatedAt = now,
                configOptions = configOptions,
            )
        } finally {
            client.close()
            exec.close()
        }
    }

    suspend fun updateWorktreePath(
        connectionId: String,
        agentId: String,
        sessionId: String,
        worktreePath: String?,
    ): Result<Unit> = useConnection(connectionId) { _, store ->
        val metadata = store.readSession(agentId, sessionId)
            ?: throw SshException("No session metadata for $agentId/$sessionId.")
        store.writeSession(
            metadata.copy(
                worktreePath = worktreePath,
                lastUsedAt = Instant.now().toString(),
            ),
        )
    }

    suspend fun deleteSession(
        connectionId: String,
        agentId: String,
        sessionId: String,
    ): Result<Unit> = useConnection(connectionId) { _, store ->
        val active = registry.find(connectionId, agentId, sessionId)
        active?.close()
        store.deleteSession(agentId, sessionId)
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

    private suspend fun sshConfig(connectionId: String): SshConfig =
        savedConnections.find(connectionId)?.ssh
            ?: throw SshException("Saved connection not found: $connectionId")

    private fun agentCommand(agentId: String): String {
        val command = "exec " + SshAcpSession.commandFor(agentId)
        return "exec bash -lc ${SshSessionStore.shellQuote(command)}"
    }

    private object NoClientRequests : AcpClientHandler {
        override suspend fun onNotification(method: String, params: JsonElement) = Unit

        override suspend fun onRequest(id: String, method: String, params: JsonElement): JsonElement =
            throw UnsupportedOperationException("$method is not available while creating a session")
    }
}

private fun JsonElement.string(key: String): String? =
    ((this as? JsonObject)?.get(key) as? JsonPrimitive)?.content
