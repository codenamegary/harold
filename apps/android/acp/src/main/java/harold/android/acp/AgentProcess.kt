package harold.android.acp

import harold.android.contracts.AgentCapabilityAgentInfo
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionResponse
import harold.android.network.isAcpAuthRequiredError
import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessChannel
import harold.android.process.AgentProcessLauncher
import harold.android.process.SessionFileService
import java.io.Closeable
import java.io.IOException
import java.io.OutputStream
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * One ACP agent process over one host process channel. It owns the single
 * `initialize` handshake and hosts every ACP session the agent runs for this
 * pool key. Sessions attach and detach around it; only process death or an
 * explicit restart closes it.
 */
class AgentProcess internal constructor(
    val connectionId: String,
    val agentId: AgentId,
    /** SSH pool identity the process is bound to. */
    val poolKey: String,
    /** Runtime map key: pool key plus agent id. */
    val key: String,
    private val channel: AgentProcessChannel,
    internal val launcher: AgentProcessLauncher,
    private val files: SessionFileService,
    private val catalog: AcpSessionCatalog,
    private val scope: CoroutineScope,
    private val onClosed: (AgentProcess) -> Unit,
) : AcpClientHandler, Closeable {
    val sessions = ConcurrentHashMap<String, AcpSession>()

    /** Completes when the process dies or closes. Null means a clean close. */
    val closed = CompletableDeferred<Throwable?>()

    @Volatile
    var closedReason: String? = null
        private set

    @Volatile
    var lastUsedNanos: Long = System.nanoTime()
        private set

    var capabilities: AgentCapabilityInventory? = null
        private set

    var agentInfo: AgentCapabilityAgentInfo? = null
        private set

    var canLoad: Boolean = false
        private set

    var canResume: Boolean = false
        private set

    private var canList: Boolean = false
    private var canDelete: Boolean = false

    private val intentional = AtomicBoolean(false)
    private val closing = AtomicBoolean(false)
    private val started = AtomicBoolean(false)
    private val dead = AtomicBoolean(false)

    /**
     * Any failed write means the stdio channel is unusable. Mark the process
     * dead so the runtime launches a replacement instead of writing to a
     * half-closed pipe again.
     */
    private val stdin: OutputStream = object : OutputStream() {
        override fun write(value: Int) {
            try {
                channel.stdin.write(value)
            } catch (error: IOException) {
                failWrite(error)
                throw error
            }
        }

        override fun write(buffer: ByteArray, offset: Int, length: Int) {
            try {
                channel.stdin.write(buffer, offset, length)
            } catch (error: IOException) {
                failWrite(error)
                throw error
            }
        }

        override fun flush() {
            try {
                channel.stdin.flush()
            } catch (error: IOException) {
                failWrite(error)
                throw error
            }
        }

        override fun close() {
            runCatching { channel.stdin.close() }
        }
    }

    private val acp = AcpClient(
        input = channel.stdout,
        output = stdin,
        scope = scope,
        handler = this,
    )

    val isDead: Boolean
        get() = dead.get() || closed.isCompleted || channel.isClosed()

    suspend fun start() {
        check(started.compareAndSet(false, true)) { "Agent process already started" }
        acp.start()
        scope.launch { onProcessClosed() }

        val initialize = try {
            acp.request(
                method = "initialize",
                params = acpInitializeParams(agentId),
                timeoutMillis = INITIALIZE_TIMEOUT_MILLIS,
            )
        } catch (error: Throwable) {
            throw launchFailure(error)
        }

        capabilities = buildCapabilityInventory(initialize)
        agentInfo = capabilities?.agentInfo
        val agentCapabilities = (initialize as? JsonObject)?.get("agentCapabilities") as? JsonObject
        canLoad = agentCapabilities?.get("loadSession").asBooleanOrFalse()
        canResume = (agentCapabilities?.get("sessionCapabilities") as? JsonObject)
            ?.containsKey("resume") == true
        canList = initialize.advertisesSessionCapability("list")
        canDelete = initialize.advertisesSessionCapability("delete")
        touch()
    }

    /**
     * `session/new`: registers a detached session that the chat screen can
     * attach to later without a `session/load`. The calling connection owns
     * the new catalog row and [AcpSession], so duplicate saved rows sharing
     * this process keep separate identities.
     */
    suspend fun sessionNew(connectionId: String, cwd: String): CreateSessionResponse {
        ensureAlive()
        val response = try {
            acp.request(
                method = "session/new",
                params = buildJsonObject {
                    put("cwd", cwd)
                    put("mcpServers", buildJsonArray { })
                },
                timeoutMillis = SESSION_NEW_TIMEOUT_MILLIS,
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
            ?.map { element -> element }
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
        sessions.remove(sessionKey(connectionId, sessionId))?.close()
        val session = AcpSession(
            connectionId = connectionId,
            agentId = agentId,
            sessionId = sessionId,
            cwd = cwd,
            created = true,
            initialTitle = NEW_SESSION_TITLE,
            initialConfigOptions = configOptions,
            process = this,
            catalog = catalog,
            scope = scope,
        )
        sessions[sessionKey(connectionId, sessionId)] = session
        touch()
        return CreateSessionResponse(
            agentId = agentId,
            sessionId = sessionId,
            cwd = cwd,
            title = NEW_SESSION_TITLE,
            updatedAt = now,
            configOptions = configOptions,
        )
    }

    /**
     * Finds or creates the in-memory session for [sessionId]. Attaching later
     * decides between the session/new fast path and `session/load`.
     */
    suspend fun openSession(
        connectionId: String,
        sessionId: String,
        cwdHint: String?,
    ): AcpSession {
        ensureAlive()
        val key = sessionKey(connectionId, sessionId)
        sessions[key]?.let { existing ->
            if (!existing.isClosed) {
                return existing
            }
            sessions.remove(key, existing)
        }
        val info = catalog.find(connectionId, agentId, sessionId)
        val cwd = cwdHint
            ?: info?.cwd
            ?: resolveSessionInfo(connectionId, sessionId)?.cwd
            ?: error(
                "The agent did not return this session from session/list. " +
                    "Refresh the session list and pick it again.",
            )
        val session = AcpSession(
            connectionId = connectionId,
            agentId = agentId,
            sessionId = sessionId,
            cwd = cwd,
            created = false,
            initialTitle = info?.title,
            initialConfigOptions = emptyList(),
            process = this,
            catalog = catalog,
            scope = scope,
        )
        sessions[key] = session
        touch()
        return session
    }

    /** `session/load` or `session/resume`, per the initialize capabilities. */
    suspend fun sessionLoad(session: AcpSession, cwd: String): List<JsonElement> {
        val method = when {
            canLoad -> "session/load"
            canResume -> "session/resume"
            else -> error(
                "This agent does not support session/load or session/resume. " +
                    "Pick an agent that can resume a session.",
            )
        }
        val response = try {
            request(
                sessionId = session.sessionId,
                method = method,
                params = buildJsonObject {
                    put("sessionId", session.sessionId)
                    put("cwd", cwd)
                    put("mcpServers", buildJsonArray { })
                },
                timeoutMillis = SESSION_LOAD_TIMEOUT_MILLIS,
            )
        } catch (error: AcpRemoteException) {
            if (isAcpAuthRequiredError(error.code, error.message)) {
                throw AgentAuthRequiredException(agentId, error.message)
            }
            throw error
        }
        return ((response as? JsonObject)?.get("configOptions") as? JsonArray)
            ?.map { element -> element }
            .orEmpty()
    }

    /** Every page of `session/list`, or nothing when the agent cannot list. */
    suspend fun sessionList(connectionId: String, cwd: String?): List<AcpSessionInfo> {
        ensureAlive()
        if (!canList) {
            return emptyList()
        }
        val found = mutableListOf<AcpSessionInfo>()
        val seenCursors = mutableSetOf<String>()
        var cursor: String? = null
        var pages = 0
        while (pages < MAX_SESSION_LIST_PAGES) {
            pages += 1
            val response = acp.request(
                method = "session/list",
                params = acpSessionListParams(cwd, cursor),
                timeoutMillis = SESSION_LIST_TIMEOUT_MILLIS,
            )
            val page = parseSessionListPage(agentId, response)
            found += page.sessions
            val next = page.nextCursor ?: break
            if (!seenCursors.add(next)) {
                break
            }
            cursor = next
        }
        touch()
        return found.filter { session -> cwd == null || session.cwd == cwd }
    }

    /** `session/delete`, with ACP's -32002 "already gone" treated as success. */
    suspend fun sessionDelete(sessionId: String) {
        ensureAlive()
        if (!canDelete) {
            throw IllegalStateException(
                "$agentId does not support session/delete. " +
                    "Remove this session with the agent's CLI on the host.",
            )
        }
        try {
            request(
                sessionId = sessionId,
                method = "session/delete",
                params = buildJsonObject { put("sessionId", sessionId) },
            )
        } catch (error: AcpRemoteException) {
            if (error.code != -32002) {
                throw error
            }
        }
    }

    /** Internal helper for requests that belong to one session. */
    suspend fun request(
        sessionId: String,
        method: String,
        params: JsonElement,
        timeoutMillis: Long = DEFAULT_REQUEST_TIMEOUT_MILLIS,
    ): JsonElement {
        ensureAlive()
        touch()
        return acp.request(method, params, timeoutMillis)
    }

    /**
     * Writes `session/prompt` and returns once the line is on the channel.
     * The caller starts the turn coroutine that awaits the response.
     */
    suspend fun beginPrompt(
        sessionId: String,
        prompt: JsonArray,
    ): AcpClient.PendingRequest {
        ensureAlive()
        touch()
        return acp.beginRequest(
            method = "session/prompt",
            params = buildJsonObject {
                put("sessionId", sessionId)
                put("prompt", prompt)
            },
        )
    }

    suspend fun cancelSession(sessionId: String) {
        ensureAlive()
        touch()
        acp.notify(
            method = "session/cancel",
            params = buildJsonObject { put("sessionId", sessionId) },
        )
    }

    internal suspend fun readBytes(path: String): ByteArray? =
        files.readBytes(connectionId, path).getOrNull()

    /** The live session owned by one saved row, if this process hosts it. */
    fun findSession(connectionId: String, sessionId: String): AcpSession? =
        sessions[sessionKey(connectionId, sessionId)]?.takeIf { session -> !session.isClosed }

    /** Removes and closes one saved row's session without touching the process. */
    fun removeSession(connectionId: String, sessionId: String): AcpSession? {
        val session = sessions.remove(sessionKey(connectionId, sessionId))
        touch()
        return session
    }

    internal fun removeSession(session: AcpSession) {
        sessions.remove(sessionKey(session.connectionId, session.sessionId), session)
        touch()
    }

    fun hasWork(): Boolean = sessions.values.any { session -> session.hasWork() }

    fun touch() {
        lastUsedNanos = System.nanoTime()
    }

    /**
     * Closes the client, channel, and every session. Does not close the SSH
     * pool entry; the pool is shared by all agents on the host.
     */
    fun close(intentional: Boolean = true) {
        if (!closing.compareAndSet(false, true)) {
            return
        }
        this.intentional.set(intentional)
        dead.set(true)
        closedReason = closedReason ?: "The agent process was closed."
        sessions.values.toList().forEach { session ->
            runCatching { session.close() }
        }
        sessions.clear()
        acp.close()
        channel.close()
        closed.complete(null)
        onClosed(this)
    }

    override fun close() {
        close(intentional = true)
    }

    override suspend fun onNotification(method: String, params: JsonElement) {
        when (method) {
            "session/update" -> {
                val sessionId = params.string("sessionId") ?: return
                // Notifications carry no saved-row id. Deliver to every row
                // watching this ACP session so duplicate rows stay in sync.
                sessionsWithId(sessionId).forEach { session -> session.handleUpdate(params) }
            }
            "elicitation/complete" -> {
                val elicitationId = params.string("elicitationId") ?: return
                val sessions = params.string("sessionId")?.let(::sessionsWithId)
                    ?: sessions.values.filter { session -> session.ownsElicitation(elicitationId) }
                sessions.forEach { session -> session.handleElicitationComplete(params) }
            }
        }
    }

    override suspend fun onRequest(
        id: String,
        method: String,
        params: JsonElement,
    ): JsonElement {
        val sessionId = params.string("sessionId")
        if (method == "elicitation/create" && sessionId == null) {
            // A request-scoped elicitation with no owning session: cancel it
            // instead of leaving the agent waiting forever.
            return buildJsonObject { put("action", "cancel") }
        }
        val candidates = sessionId?.let(::sessionsWithId).orEmpty()
        val session = candidates.firstOrNull { candidate -> candidate.isPrompting }
            ?: candidates.firstOrNull { candidate -> candidate.hasWork() }
            ?: candidates.firstOrNull()
            ?: throw AcpRemoteException(
                code = -32602,
                detail = "Unknown session: ${sessionId ?: "(none)"}",
                data = null,
            )
        touch()
        return when (method) {
            "session/request_permission" -> session.awaitPermission(id, params)
            "elicitation/create" -> session.awaitElicitation(id, params)
            "fs/read_text_file" -> readTextFile(params)
            "fs/write_text_file" -> writeTextFile(params)
            "terminal/create" -> buildJsonObject {
                put("terminalId", session.terminals.create(params.requireObject()))
            }
            "terminal/output" -> session.terminals.output(params.requireString("terminalId"))
            "terminal/wait_for_exit" ->
                session.terminals.waitForExit(params.requireString("terminalId"))
            "terminal/kill" -> {
                session.terminals.kill(params.requireString("terminalId"))
                JsonNull
            }
            "terminal/release" -> {
                session.terminals.release(params.requireString("terminalId"))
                JsonNull
            }
            else -> throw AcpRemoteException(
                code = -32601,
                detail = "Method not found: $method",
                data = null,
            )
        }
    }

    private suspend fun onProcessClosed() {
        val cause = acp.closed.await()
        if (intentional.get()) {
            return
        }
        val reason = cause?.message?.takeIf { message -> message.isNotBlank() }
            ?: "The agent process closed."
        dead.set(true)
        closedReason = reason
        closed.complete(cause)
        sessions.values.toList().forEach { session -> session.onProcessClosed(reason) }
        runCatching { channel.close() }
        onClosed(this)
    }

    private suspend fun resolveSessionInfo(
        connectionId: String,
        sessionId: String,
    ): AcpSessionInfo? =
        sessionList(connectionId = connectionId, cwd = null)
            .firstOrNull { session -> session.sessionId == sessionId }

    private fun sessionsWithId(sessionId: String): List<AcpSession> =
        sessions.values.filter { session -> session.sessionId == sessionId }

    private fun sessionKey(connectionId: String, sessionId: String): String =
        "$connectionId|$sessionId"

    private fun ensureAlive() {
        if (isDead) {
            throw AcpClosedException(closedReason ?: "The agent process is not running.")
        }
    }

    private fun failWrite(error: IOException) {
        if (closing.get()) {
            return
        }
        closedReason = error.message?.takeIf { message -> message.isNotBlank() }
            ?: "The agent connection closed."
        close(intentional = false)
    }

    private fun launchFailure(error: Throwable): Throwable {
        if (
            error is AgentLaunchException ||
            error is AgentAuthRequiredException ||
            error is AcpRemoteException
        ) {
            return error
        }
        val stderr = runCatching { channel.stderrText().trim() }.getOrDefault("")
        if (!channel.isClosed() && stderr.isEmpty()) {
            return error
        }
        val detail = stderr.ifBlank {
            if (error is IOException) {
                "the agent connection closed."
            } else {
                error.message ?: "the ACP process closed."
            }
        }
        val label = channel.label.ifBlank { "The agent" }
        return AgentLaunchException(
            "$label failed to start: ${detail.take(MAX_LAUNCH_DETAIL)}",
            error,
        )
    }

    private suspend fun readTextFile(params: JsonElement): JsonElement {
        val path = params.requireString("path")
        val content = files.readTextFile(connectionId, path).getOrThrow()
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
        files.writeTextFile(connectionId, path, content).getOrThrow()
        return JsonNull
    }

    companion object {
        const val NEW_SESSION_TITLE: String = "New session"

        private const val INITIALIZE_TIMEOUT_MILLIS = 60_000L
        private const val SESSION_NEW_TIMEOUT_MILLIS = 180_000L
        private const val SESSION_LOAD_TIMEOUT_MILLIS = 180_000L
        private const val SESSION_LIST_TIMEOUT_MILLIS = 60_000L
        private const val DEFAULT_REQUEST_TIMEOUT_MILLIS = 120_000L
        private const val MAX_SESSION_LIST_PAGES = 100
        private const val MAX_LAUNCH_DETAIL = 500
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
