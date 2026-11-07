package harold.android.transport.ssh

import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentReference
import harold.android.contracts.ConfigValue
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.SessionStreamServerMessage
import harold.android.contracts.SessionStreamServerMessage.Cancelled
import harold.android.contracts.SessionStreamServerMessage.ElicitationCompleted
import harold.android.contracts.SessionStreamServerMessage.ElicitationRequest
import harold.android.contracts.SessionStreamServerMessage.Error
import harold.android.contracts.SessionStreamServerMessage.PermissionRequest
import harold.android.contracts.SessionStreamServerMessage.PromptComplete
import harold.android.contracts.SessionStreamServerMessage.SessionConfig
import harold.android.contracts.SessionStreamServerMessage.SessionInfo
import harold.android.contracts.SessionStreamServerMessage.SessionUpdate
import harold.android.contracts.SessionStreamServerMessage.SessionWorktreePath
import harold.android.contracts.SessionStreamServerMessage.Subscribed
import harold.android.transport.acp.AcpClient
import harold.android.transport.acp.AcpClientHandler
import harold.android.transport.acp.AcpRemoteException
import java.io.Closeable
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * One ACP agent process over one SSH exec channel. The app owns the process:
 * closing the channel (or losing the network) ends the process and releases
 * the session lock.
 */
class SshAcpSession(
    val connectionId: String,
    val agentId: AgentId,
    val sessionId: String,
    private val metadata: HostSessionMetadata,
    private val store: SshSessionStore,
    private val connection: SshConnection,
    private val exec: SshExecChannel,
    private val lock: SshSessionLock?,
    private val scope: CoroutineScope,
) : AcpClientHandler, Closeable {
    private val acp = AcpClient(
        input = exec.stdout,
        output = exec.stdin,
        scope = scope,
        handler = this,
    )
    private val terminals = SshTerminals(connection, scope)
    private val pendingPermissions = ConcurrentHashMap<String, CompletableDeferred<JsonElement>>()
    private val pendingElicitations = ConcurrentHashMap<String, CompletableDeferred<JsonElement>>()
    private val urlElicitationRequests = ConcurrentHashMap<String, String>()
    private val prompting = AtomicBoolean(false)
    private var intentionalClose = false

    private val frames = kotlinx.coroutines.channels.Channel<SessionStreamServerMessage>(
        capacity = kotlinx.coroutines.channels.Channel.UNLIMITED,
    )
    val events: kotlinx.coroutines.flow.Flow<SessionStreamServerMessage> =
        frames.receiveAsFlow()

    val closed = CompletableDeferred<String?>()

    /**
     * The live handshake result. Null until the agent answered `initialize`,
     * and gone once this session closes — nothing about capabilities is
     * persisted.
     */
    var capabilities: AgentCapabilityInventory? = null
        private set

    suspend fun start() {
        acp.start()
        scope.launch {
            val cause = acp.closed.await()
            if (!intentionalClose) {
                frames.close()
                closed.complete(cause?.message ?: "Agent process closed")
            }
        }

        val initialize = acp.request(
            method = "initialize",
            params = buildJsonObject {
                put("protocolVersion", 1)
                putJsonObject("clientCapabilities") {
                    putJsonObject("fs") {
                        put("readTextFile", true)
                        put("writeTextFile", true)
                    }
                    put("terminal", true)
                }
                putJsonObject("clientInfo") {
                    put("name", "Harold Android")
                    put("version", "android")
                }
            },
        )
        val initializeObject = initialize as? JsonObject
        this.capabilities = buildCapabilityInventory(initialize)

        // Every open is a full replay: session/load resends the conversation
        // from the agent's history. The stream owner keeps its last
        // transcript across a reconnect, so it must drop it before the
        // replay lands or the content shows twice.
        emitFrame(
            SessionStreamServerMessage.StreamReset(
                agentId = agentId,
                sessionId = sessionId,
            ),
        )
        val capabilities = initializeObject?.get("agentCapabilities") as? JsonObject
        val canLoad = capabilities?.get("loadSession").asBooleanOrFalse()
        val canResume = (capabilities?.get("sessionCapabilities") as? JsonObject)
            ?.containsKey("resume") == true

        val loadResponse = when {
            canLoad -> acp.request(
                method = "session/load",
                params = loadParams(),
                timeoutMillis = 180_000,
            )
            canResume -> acp.request(
                method = "session/resume",
                params = loadParams(),
                timeoutMillis = 180_000,
            )
            else -> error(
                "This agent does not support session/load or session/resume. " +
                    "Pick an agent that can resume a session.",
            )
        }

        val loadResponseObject = loadResponse as? JsonObject
        val configOptions = (loadResponseObject?.get("configOptions") as? JsonArray)
            ?.map { element -> element }
            .orEmpty()
        if (configOptions.isNotEmpty()) {
            emitFrame(
                SessionConfig(
                    agentId = agentId,
                    sessionId = sessionId,
                    configOptions = configOptions,
                ),
            )
        }
        emitFrame(
            SessionInfo(
                agentId = agentId,
                sessionId = sessionId,
                title = metadata.title,
            ),
        )
        metadata.worktreePath?.let { worktreePath ->
            emitFrame(
                SessionWorktreePath(
                    agentId = agentId,
                    sessionId = sessionId,
                    worktreePath = worktreePath,
                ),
            )
        }
        emitFrame(Subscribed(agentId = agentId, sessionId = sessionId))
        runCatching { store.touchSession(agentId, sessionId) }
    }

    suspend fun prompt(body: PromptRequestBody): Result<Unit> {
        if (closed.isCompleted) {
            return Result.failure(IllegalStateException("The session is closed."))
        }
        if (!prompting.compareAndSet(false, true)) {
            return Result.failure(IllegalStateException("A turn is already running."))
        }

        val prompt = buildJsonArray {
            add(
                buildJsonObject {
                    put("type", "text")
                    put("text", body.text)
                },
            )
            body.attachments.forEach { reference ->
                add(contentBlock(reference))
            }
        }

        scope.launch(Dispatchers.IO) {
            try {
                rememberTitle(body.text)
                store.readSession(agentId, sessionId)?.title?.let { title ->
                    emitFrame(
                        SessionInfo(
                            agentId = agentId,
                            sessionId = sessionId,
                            title = title,
                        ),
                    )
                }
                val response = acp.request(
                    method = "session/prompt",
                    params = buildJsonObject {
                        put("sessionId", sessionId)
                        put("prompt", prompt)
                    },
                    timeoutMillis = 60 * 60 * 1000L,
                )
                val stopReason = response.string("stopReason")
                if (stopReason == "cancelled") {
                    emitFrame(Cancelled(agentId = agentId, sessionId = sessionId))
                } else {
                    emitFrame(PromptComplete(agentId = agentId, sessionId = sessionId))
                }
                runCatching { store.touchSession(agentId, sessionId) }
            } catch (error: Throwable) {
                emitFrame(
                    Error(
                        message = error.message ?: "Prompt failed",
                        agentId = agentId,
                        sessionId = sessionId,
                    ),
                )
            } finally {
                prompting.set(false)
            }
        }
        return Result.success(Unit)
    }

    suspend fun cancel(): Result<Unit> = runCatching {
        acp.notify(
            method = "session/cancel",
            params = buildJsonObject { put("sessionId", sessionId) },
        )
        val cancelled = buildJsonObject {
            putJsonObject("outcome") { put("outcome", "cancelled") }
        }
        pendingPermissions.values.forEach { deferred -> deferred.complete(cancelled) }
        pendingPermissions.clear()
        pendingElicitations.values.forEach { deferred ->
            deferred.complete(buildJsonObject { put("action", "cancel") })
        }
        pendingElicitations.clear()
    }

    fun hasPermission(requestId: String): Boolean = pendingPermissions.containsKey(requestId)

    fun hasElicitation(requestId: String): Boolean = pendingElicitations.containsKey(requestId)

    suspend fun replyPermission(requestId: String, optionId: String): Result<Unit> {
        val deferred = pendingPermissions.remove(requestId)
            ?: return Result.failure(IllegalStateException("Permission request is no longer active."))
        deferred.complete(
            buildJsonObject {
                putJsonObject("outcome") {
                    put("outcome", "selected")
                    put("optionId", optionId)
                }
            },
        )
        return Result.success(Unit)
    }

    suspend fun replyElicitation(requestId: String, result: JsonElement): Result<Unit> {
        val deferred = pendingElicitations.remove(requestId)
            ?: return Result.failure(IllegalStateException("Elicitation is no longer active."))
        deferred.complete(result)
        return Result.success(Unit)
    }

    suspend fun setConfigOption(configId: String, value: ConfigValue): Result<Unit> =
        runCatching {
            val response = acp.request(
                method = "session/set_config_option",
                params = buildJsonObject {
                    put("sessionId", sessionId)
                    put("configId", configId)
                    when (value) {
                        is ConfigValue.Text -> put("value", value.value)
                        is ConfigValue.Toggle -> {
                            put("type", "boolean")
                            put("value", value.value)
                        }
                    }
                },
            )
            val responseObject = response as? JsonObject
            val configOptions = (responseObject?.get("configOptions") as? JsonArray)
                ?.map { element -> element }
                .orEmpty()
            emitFrame(
                SessionConfig(
                    agentId = agentId,
                    sessionId = sessionId,
                    configOptions = configOptions,
                ),
            )
        }

    override suspend fun onNotification(method: String, params: JsonElement) {
        when (method) {
            "session/update" -> {
                val update = (params as? JsonObject)?.get("update") ?: return
                emitFrame(
                    SessionUpdate(
                        agentId = agentId,
                        sessionId = sessionId,
                        update = update,
                    ),
                )
            }
            "elicitation/complete" -> {
                val elicitationId = params.string("elicitationId") ?: return
                val requestId = urlElicitationRequests.remove(elicitationId) ?: elicitationId
                emitFrame(
                    ElicitationCompleted(
                        elicitationId = elicitationId,
                        requestId = requestId,
                        agentId = agentId,
                        sessionId = sessionId,
                    ),
                )
            }
        }
    }

    override suspend fun onRequest(id: String, method: String, params: JsonElement): JsonElement =
        when (method) {
            "session/request_permission" -> awaitPermission(id, params)
            "elicitation/create" -> awaitElicitation(id, params)
            "fs/read_text_file" -> readTextFile(params)
            "fs/write_text_file" -> writeTextFile(params)
            "terminal/create" -> buildJsonObject {
                put("terminalId", terminals.create(params.requireObject()))
            }
            "terminal/output" -> terminals.output(params.requireString("terminalId"))
            "terminal/wait_for_exit" -> terminals.waitForExit(params.requireString("terminalId"))
            "terminal/kill" -> {
                terminals.kill(params.requireString("terminalId"))
                JsonNull
            }
            "terminal/release" -> {
                terminals.release(params.requireString("terminalId"))
                JsonNull
            }
            else -> throw AcpRemoteException(
                code = -32601,
                detail = "Method not found: $method",
                data = null,
            )
        }

    override fun close() {
        intentionalClose = true
        frames.close()
        val cancelled = buildJsonObject {
            putJsonObject("outcome") { put("outcome", "cancelled") }
        }
        pendingPermissions.values.forEach { deferred -> deferred.complete(cancelled) }
        pendingPermissions.clear()
        pendingElicitations.values.forEach { deferred ->
            deferred.complete(buildJsonObject { put("action", "cancel") })
        }
        pendingElicitations.clear()
        terminals.close()
        acp.close()
        exec.close()
        // Release the remote flock before disconnecting the SSH session;
        // JSch waits for open channels during disconnect.
        lock?.close()
        connection.close()
        closed.complete(null)
    }

    private suspend fun awaitPermission(id: String, params: JsonElement): JsonElement {
        val deferred = CompletableDeferred<JsonElement>()
        pendingPermissions[id] = deferred
        emitFrame(
            PermissionRequest(
                requestId = id,
                agentId = agentId,
                sessionId = sessionId,
                params = params,
            ),
        )
        return try {
            withTimeout(PERMISSION_TIMEOUT_MILLIS) { deferred.await() }
        } finally {
            pendingPermissions.remove(id)
        }
    }

    private suspend fun awaitElicitation(id: String, params: JsonElement): JsonElement {
        val deferred = CompletableDeferred<JsonElement>()
        pendingElicitations[id] = deferred
        val elicitationId = params.string("elicitationId")
        if (elicitationId != null) {
            urlElicitationRequests[elicitationId] = id
        }
        emitFrame(
            ElicitationRequest(
                requestId = id,
                agentId = agentId,
                sessionId = sessionId,
                params = params,
                expiresAt = Instant.now().plusSeconds(300).toString(),
            ),
        )
        return try {
            withTimeout(ELICITATION_TIMEOUT_MILLIS) { deferred.await() }
        } finally {
            pendingElicitations.remove(id)
        }
    }

    private suspend fun readTextFile(params: JsonElement): JsonElement {
        val path = params.requireString("path")
        val content = connection.readFile(path).toString(Charsets.UTF_8)
        val line = params.int("line") ?: 1
        val limit = params.int("limit")
        val lines = content.lines()
        val from = (line - 1).coerceAtLeast(0)
        val selected = if (limit == null) {
            lines.drop(from)
        } else {
            lines.drop(from).take(limit)
        }
        return buildJsonObject {
            put("content", selected.joinToString("\n"))
        }
    }

    private suspend fun writeTextFile(params: JsonElement): JsonElement {
        val path = params.requireString("path")
        val content = params.requireString("content")
        connection.writeFile(path, content.toByteArray(Charsets.UTF_8))
        return JsonNull
    }

    private suspend fun contentBlock(reference: AttachmentReference): JsonObject =
        when (reference.kind) {
            AttachmentKind.Image -> {
                val bytes = runCatching { connection.readFile(reference.path) }.getOrNull()
                if (bytes == null) {
                    resourceLink(reference)
                } else {
                    buildJsonObject {
                        put("type", "image")
                        put("mimeType", reference.mimeType)
                        put("data", Base64.getEncoder().encodeToString(bytes))
                    }
                }
            }
            AttachmentKind.File -> resourceLink(reference)
        }

    private fun resourceLink(reference: AttachmentReference): JsonObject =
        buildJsonObject {
            put("type", "resource_link")
            put("uri", java.io.File(reference.path).toURI().toString())
            put("name", reference.name)
            put("mimeType", reference.mimeType)
        }

    private suspend fun rememberTitle(text: String) {
        val current = runCatching { store.readSession(agentId, sessionId) }.getOrNull() ?: return
        if (current.title.isNotBlank() && current.title != sessionId && current.title != "New session") {
            return
        }
        val title = text.trim().replace('\n', ' ').take(80).ifBlank { "New session" }
        runCatching {
            store.writeSession(current.copy(title = title, lastUsedAt = Instant.now().toString()))
        }
    }

    private suspend fun emitFrame(message: SessionStreamServerMessage) {
        frames.send(message)
    }

    private fun loadParams(): JsonObject = buildJsonObject {
        put("sessionId", sessionId)
        put("cwd", metadata.cwd)
        put("mcpServers", buildJsonArray { })
    }

    companion object {
        private const val PERMISSION_TIMEOUT_MILLIS = 30 * 60 * 1000L
        private const val ELICITATION_TIMEOUT_MILLIS = 30 * 60 * 1000L
    }
}

private fun JsonElement?.asBooleanOrFalse(): Boolean =
    (this as? JsonPrimitive)?.content?.toBooleanStrictOrNull() == true

private fun JsonElement.string(key: String): String? =
    ((this as? JsonObject)?.get(key) as? JsonPrimitive)?.content

private fun JsonElement.int(key: String): Int? = string(key)?.toIntOrNull()

private fun JsonElement.requireString(key: String): String =
    string(key) ?: error("Missing $key")

private fun JsonElement.requireObject(): JsonObject =
    this as? JsonObject ?: error("Expected an object")
