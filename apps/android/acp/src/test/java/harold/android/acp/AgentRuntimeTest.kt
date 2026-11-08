package harold.android.acp

import harold.android.contracts.AgentId
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.SessionStreamServerMessage
import harold.android.network.PromptResult
import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessChannel
import harold.android.process.AgentProcessLauncher
import harold.android.process.LaunchableAgent
import harold.android.process.SessionFileService
import harold.android.process.TerminalLaunchSpec
import harold.android.stream.SessionStatus
import java.io.InputStream
import java.io.OutputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Exercises one-process-many-sessions against a tiny in-process ACP agent.
 * The fake speaks only the JSON-RPC methods this runtime calls, which keeps
 * the behavioral contract visible without an SSH server.
 */
class AgentRuntimeTest {
    @Test
    fun creatingSessionsStartsOneProcess() = runBlocking {
        withRuntime { runtime, launcher ->
            val first = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/one").getOrThrow()
            val second = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/two").getOrThrow()

            assertEquals(1, launcher.launchCount)
            assertEquals(2, launcher.agents.single().sessionsCreated.get())
            assertTrue(first.sessionId != second.sessionId)
        }
    }

    @Test
    fun promptsAndPermissionsRouteToTheRightSession() = runBlocking {
        withRuntime { runtime, launcher ->
            val createdA = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/a").getOrThrow()
            val createdB = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/b").getOrThrow()
            val sessionA = runtime.openSession(FIRST_ROW, AGENT_ID, createdA.sessionId).getOrThrow()
            val sessionB = runtime.openSession(FIRST_ROW, AGENT_ID, createdB.sessionId).getOrThrow()

            val permissionsA = CompletableDeferred<SessionStreamServerMessage.PermissionRequest>()
            val permissionsB = CompletableDeferred<SessionStreamServerMessage.PermissionRequest>()
            val completeA = CompletableDeferred<Unit>()
            val completeB = CompletableDeferred<Unit>()
            val collectorA = launch {
                sessionA.attach().events.collect { message ->
                    when (message) {
                        is SessionStreamServerMessage.PermissionRequest ->
                            permissionsA.complete(message)
                        is SessionStreamServerMessage.PromptComplete -> completeA.complete(Unit)
                        else -> Unit
                    }
                }
            }
            val collectorB = launch {
                sessionB.attach().events.collect { message ->
                    when (message) {
                        is SessionStreamServerMessage.PermissionRequest ->
                            permissionsB.complete(message)
                        is SessionStreamServerMessage.PromptComplete -> completeB.complete(Unit)
                        else -> Unit
                    }
                }
            }

            assertEquals(
                PromptResult.Accepted,
                sessionA.prompt(PromptRequestBody("hello A")).getOrThrow(),
            )
            assertEquals(
                PromptResult.Accepted,
                sessionB.prompt(PromptRequestBody("hello B")).getOrThrow(),
            )

            val permissionA = withTimeout(10_000) { permissionsA.await() }
            val permissionB = withTimeout(10_000) { permissionsB.await() }
            assertEquals(createdA.sessionId, permissionA.sessionId)
            assertEquals(createdB.sessionId, permissionB.sessionId)

            runtime.findSession(FIRST_ROW, AGENT_ID, createdA.sessionId)!!
                .replyPermission(permissionA.requestId, "allow").getOrThrow()
            runtime.findSession(FIRST_ROW, AGENT_ID, createdB.sessionId)!!
                .replyPermission(permissionB.requestId, "allow").getOrThrow()

            withTimeout(10_000) {
                completeA.await()
                completeB.await()
            }
            assertEquals(2, launcher.agents.single().promptsStarted.get())
            collectorA.cancel()
            collectorB.cancel()
        }
    }

    @Test
    fun reopeningASessionLoadsItOnTheSameProcess() = runBlocking {
        withRuntime { runtime, launcher ->
            val created = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/reopen").getOrThrow()
            val first = runtime.openSession(FIRST_ROW, AGENT_ID, created.sessionId).getOrThrow()
            val subscribed = CompletableDeferred<Unit>()
            val collector = launch {
                first.attach().events.collect { message ->
                    if (message is SessionStreamServerMessage.Subscribed) subscribed.complete(Unit)
                }
            }
            withTimeout(10_000) { subscribed.await() }
            collector.cancel()
            first.close()

            val replayed = CompletableDeferred<Unit>()
            val reopened = runtime.openSession(FIRST_ROW, AGENT_ID, created.sessionId).getOrThrow()
            val reopenCollector = launch {
                reopened.attach().events.collect { message ->
                    if (message is SessionStreamServerMessage.SessionUpdate &&
                        message.update.toString().contains("replayed history")
                    ) {
                        replayed.complete(Unit)
                    }
                }
            }
            withTimeout(10_000) { replayed.await() }

            assertNotSame(first, reopened)
            assertEquals(1, launcher.launchCount)
            assertEquals(1, launcher.agents.single().sessionLoads.get())
            reopenCollector.cancel()
        }
    }

    @Test
    fun killingTheProcessOfflinesEverySessionAndTheNextOpenRestartsIt() = runBlocking {
        withRuntime { runtime, launcher ->
            val createdA = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/a").getOrThrow()
            val createdB = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/b").getOrThrow()
            val sessionA = runtime.openSession(FIRST_ROW, AGENT_ID, createdA.sessionId).getOrThrow()
            val sessionB = runtime.openSession(FIRST_ROW, AGENT_ID, createdB.sessionId).getOrThrow()

            launcher.channels.single().kill()

            awaitStatus(sessionA, SessionStatus.Offline)
            awaitStatus(sessionB, SessionStatus.Offline)

            val reopened = runtime.openSession(FIRST_ROW, AGENT_ID, createdA.sessionId).getOrThrow()
            assertEquals(2, launcher.launchCount)
            assertNotSame(sessionA, reopened)
        }
    }

    @Test
    fun losingTheProcessAfterTheWriteInterruptsTheTurnWithoutReplay() = runBlocking {
        withRuntime { runtime, launcher ->
            val created = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/lost").getOrThrow()
            val session = runtime.openSession(FIRST_ROW, AGENT_ID, created.sessionId).getOrThrow()
            val agent = launcher.agents.single()
            agent.answerPrompts = false

            val settled = async(start = CoroutineStart.UNDISPATCHED) {
                session.turnResults.first()
            }

            assertEquals(
                PromptResult.Accepted,
                session.prompt(PromptRequestBody("do not lose me")).getOrThrow(),
            )
            withTimeout(10_000) { agent.promptReceived.await() }
            launcher.channels.single().kill()

            assertEquals(PromptResult.Interrupted, withTimeout(10_000) { settled.await() })
            delay(200)
            assertEquals(1, agent.promptsStarted.get())
        }
    }

    @Test
    fun statusMovesReadyReloadingReadyAcrossAReopen() = runBlocking {
        withRuntime { runtime, launcher ->
            val created = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/status").getOrThrow()
            val first = runtime.openSession(FIRST_ROW, AGENT_ID, created.sessionId).getOrThrow()
            val subscribed = CompletableDeferred<Unit>()
            val firstCollector = launch {
                first.attach().events.collect { message ->
                    if (message is SessionStreamServerMessage.Subscribed) subscribed.complete(Unit)
                }
            }
            withTimeout(10_000) { subscribed.await() }
            assertEquals(SessionStatus.Ready, first.status.value)
            firstCollector.cancel()
            first.close()

            val reopened = runtime.openSession(FIRST_ROW, AGENT_ID, created.sessionId).getOrThrow()
            val seen = mutableListOf<SessionStatus>()
            val statusCollector = launch {
                reopened.status.collect { status -> seen += status }
            }
            val reopenSubscribed = CompletableDeferred<Unit>()
            val reopenCollector = launch {
                reopened.attach().events.collect { message ->
                    if (message is SessionStreamServerMessage.Subscribed) {
                        reopenSubscribed.complete(Unit)
                    }
                }
            }
            withTimeout(10_000) { reopenSubscribed.await() }
            awaitStatus(reopened, SessionStatus.Ready)

            val reloadIndex = seen.indexOf(SessionStatus.Reloading)
            assertTrue(reloadIndex >= 0)
            assertTrue(seen.drop(reloadIndex).contains(SessionStatus.Ready))
            assertFalse(seen.drop(reloadIndex + 1).contains(SessionStatus.Reloading))
            assertEquals(1, launcher.launchCount)
            statusCollector.cancel()
            reopenCollector.cancel()
        }
    }

    @Test
    fun listAndDeleteReuseTheProcess() = runBlocking {
        withRuntime { runtime, launcher ->
            val created = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/list").getOrThrow()

            val listed = runtime.listSessions(FIRST_ROW).getOrThrow()
            assertTrue(listed.any { session -> session.sessionId == created.sessionId })

            runtime.deleteSession(FIRST_ROW, AGENT_ID, created.sessionId).getOrThrow()
            assertEquals(1, launcher.launchCount)
            assertEquals(1, launcher.agents.single().sessionLists.get())
            assertEquals(1, launcher.agents.single().sessionDeletes.get())
            val after = runtime.listSessions(FIRST_ROW).getOrThrow()
            assertFalse(after.any { session -> session.sessionId == created.sessionId })
            assertEquals(1, launcher.launchCount)
        }
    }

    @Test
    fun backgroundCloseLeavesASessionWithAnAttachedStreamAlone() = runBlocking {
        withRuntime { runtime, launcher ->
            val created = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/idle").getOrThrow()
            val session = runtime.openSession(FIRST_ROW, AGENT_ID, created.sessionId).getOrThrow()
            val subscribed = CompletableDeferred<Unit>()
            val subscription = session.attach()
            val collector = launch {
                subscription.events.collect { message ->
                    if (message is SessionStreamServerMessage.Subscribed) subscribed.complete(Unit)
                }
            }
            withTimeout(10_000) { subscribed.await() }

            runtime.onBackground()
            assertFalse(launcher.channels.single().isClosed())

            subscription.detach()
            collector.cancel()
            runtime.onBackground()
            assertTrue(launcher.channels.single().isClosed())
            assertTrue(session.isClosed)
        }
    }

    @Test
    fun duplicateSavedRowsShareTheProcessButKeepTheirOwnSessions() = runBlocking {
        withRuntime { runtime, launcher ->
            val created = runtime.createSession(FIRST_ROW, AGENT_ID, "/tmp/duplicate").getOrThrow()
            val first = runtime.openSession(FIRST_ROW, AGENT_ID, created.sessionId).getOrThrow()
            val second = runtime.openSession(
                SECOND_ROW,
                AGENT_ID,
                created.sessionId,
                cwd = "/tmp/duplicate",
            ).getOrThrow()

            assertEquals(1, launcher.launchCount)
            assertNotSame(first, second)
            assertEquals(FIRST_ROW, first.connectionId)
            assertEquals(SECOND_ROW, second.connectionId)
            assertEquals(first, runtime.findSession(FIRST_ROW, AGENT_ID, created.sessionId))
            assertEquals(second, runtime.findSession(SECOND_ROW, AGENT_ID, created.sessionId))
        }
    }

    private suspend fun withRuntime(
        block: suspend (AgentRuntime, FakeLauncher) -> Unit,
    ) {
        val launcher = FakeLauncher()
        val runtime = AgentRuntime(
            launcher = launcher,
            files = NoopFiles,
            catalog = AcpSessionCatalog(),
        )
        try {
            block(runtime, launcher)
        } finally {
            runtime.closeConnection(FIRST_ROW)
            runtime.closeConnection(SECOND_ROW)
            launcher.close()
        }
    }

    private suspend fun awaitStatus(session: AcpSession, status: SessionStatus) {
        withTimeout(10_000) {
            while (session.status.value != status) {
                delay(10)
            }
        }
    }

    private companion object {
        const val AGENT_ID: AgentId = "fake-agent"
        const val FIRST_ROW = "row-one"
        const val SECOND_ROW = "row-two"
    }
}

private object NoopFiles : SessionFileService {
    override suspend fun readTextFile(connectionId: String, path: String): Result<String> =
        Result.failure(AgentLaunchException("not used"))

    override suspend fun writeTextFile(
        connectionId: String,
        path: String,
        content: String,
    ): Result<Unit> = Result.failure(AgentLaunchException("not used"))
}

private class FakeLauncher : AgentProcessLauncher {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val channels = mutableListOf<FakeChannel>()
    val agents = mutableListOf<FakeAgent>()
    var launchCount = 0
        private set

    override suspend fun launchableAgents(connectionId: String): Result<List<LaunchableAgent>> =
        Result.success(listOf(LaunchableAgent(id = "fake-agent", displayName = "Fake agent")))

    override suspend fun keyFor(connectionId: String): String = "shared-pool-key"

    override suspend fun launchAgent(
        connectionId: String,
        agentId: String,
    ): Result<AgentProcessChannel> {
        launchCount += 1
        val channel = FakeChannel()
        channels += channel
        agents += FakeAgent(channel, scope).also { agent -> agent.start() }
        return Result.success(channel)
    }

    override suspend fun launchTerminal(
        connectionId: String,
        spec: TerminalLaunchSpec,
    ): Result<AgentProcessChannel> = Result.failure(AgentLaunchException("not used"))

    fun close() {
        channels.forEach { channel -> channel.close() }
        scope.cancel()
    }
}

private class FakeChannel : AgentProcessChannel {
    private val agentInput = PipedInputStream(PIPE_BUFFER)
    private val processOutput = PipedInputStream(PIPE_BUFFER)
    private val agentInputWriter = PipedOutputStream(agentInput)
    private val processOutputWriter = PipedOutputStream(processOutput)
    private val closed = AtomicBoolean(false)

    override val stdin: OutputStream = agentInputWriter
    override val stdout: InputStream = processOutput

    val agentInputSource: InputStream = agentInput
    val agentOutput: OutputStream = processOutputWriter

    override fun stderrText(): String = ""

    override fun isClosed(): Boolean = closed.get()

    override suspend fun awaitExit(): Int = 0

    override fun close() {
        if (closed.compareAndSet(false, true)) {
            runCatching { agentInputWriter.close() }
            runCatching { agentInput.close() }
            runCatching { processOutputWriter.close() }
            runCatching { processOutput.close() }
        }
    }

    fun kill() = close()

    private companion object {
        const val PIPE_BUFFER = 64 * 1024
    }
}

/**
 * The smallest ACP responder that covers prompt turns, permission requests,
 * session load replay, list, and delete. Each incoming line gets its own
 * coroutine so a permission round trip does not stall the reader.
 */
private class FakeAgent(
    private val channel: FakeChannel,
    private val scope: CoroutineScope,
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val writeLock = Mutex()
    private val clientResponses = ConcurrentHashMap<String, CompletableDeferred<JsonElement>>()
    private val sessions = ConcurrentHashMap<String, String>()
    private val requestIds = AtomicLong(0)
    private val newSessions = AtomicInteger(0)

    val promptsStarted = AtomicInteger(0)
    val promptReceived = CompletableDeferred<Unit>()
    val sessionLoads = AtomicInteger(0)
    val sessionLists = AtomicInteger(0)
    val sessionDeletes = AtomicInteger(0)
    val sessionsCreated = AtomicInteger(0)

    @Volatile
    var answerPrompts: Boolean = true

    fun start() {
        scope.launch(Dispatchers.IO) {
            try {
                channel.agentInputSource.bufferedReader().useLines { lines ->
                    lines.forEach { line ->
                        val message = runCatching { json.parseToJsonElement(line) }.getOrNull()
                            as? JsonObject ?: return@forEach
                        if (message["method"] != null) {
                            scope.launch { handleRequest(message) }
                        } else {
                            completeClientResponse(message)
                        }
                    }
                }
            } catch (_: Throwable) {
                // The runtime killed the pipe.
            }
        }
    }

    private suspend fun handleRequest(message: JsonObject) {
        val id = message["id"] ?: return
        val method = (message["method"] as? JsonPrimitive)?.content ?: return
        val params = message["params"] as? JsonObject ?: JsonObject(emptyMap())
        when (method) {
            "initialize" -> respond(
                id,
                buildJsonObject {
                    put("protocolVersion", 1)
                    putJsonObject("agentCapabilities") {
                        put("loadSession", true)
                        putJsonObject("sessionCapabilities") {
                            putJsonObject("list") { }
                            putJsonObject("delete") { }
                        }
                    }
                },
            )

            "session/new" -> {
                val sessionId = "fake-session-${newSessions.incrementAndGet()}"
                sessions[sessionId] = params.string("cwd").orEmpty()
                sessionsCreated.incrementAndGet()
                respond(
                    id,
                    buildJsonObject {
                        put("sessionId", sessionId)
                        put("configOptions", buildJsonArray { })
                    },
                )
            }

            "session/load" -> {
                val sessionId = params.string("sessionId").orEmpty()
                sessionLoads.incrementAndGet()
                notifyUpdate(sessionId, "replayed history")
                respond(id, buildJsonObject { put("configOptions", buildJsonArray { }) })
            }

            "session/list" -> {
                sessionLists.incrementAndGet()
                respond(
                    id,
                    buildJsonObject {
                        put(
                            "sessions",
                            buildJsonArray {
                                sessions.forEach { (sessionId, cwd) ->
                                    add(
                                        buildJsonObject {
                                            put("sessionId", sessionId)
                                            put("cwd", cwd)
                                        },
                                    )
                                }
                            },
                        )
                    },
                )
            }

            "session/delete" -> {
                val sessionId = params.string("sessionId").orEmpty()
                sessions.remove(sessionId)
                sessionDeletes.incrementAndGet()
                respond(id, JsonObject(emptyMap()))
            }

            "session/prompt" -> {
                val sessionId = params.string("sessionId").orEmpty()
                promptsStarted.incrementAndGet()
                promptReceived.complete(Unit)
                if (!answerPrompts) {
                    return
                }
                val permission = requestClient(
                    method = "session/request_permission",
                    params = buildJsonObject {
                        put("sessionId", sessionId)
                        put("toolCall", buildJsonObject { put("toolCallId", "tool-1") })
                        put(
                            "options",
                            buildJsonArray {
                                add(
                                    buildJsonObject {
                                        put("optionId", "allow")
                                        put("name", "Allow")
                                    },
                                )
                            },
                        )
                    },
                )
                require(permission != JsonNull)
                notifyUpdate(sessionId, "permission answered")
                respond(id, buildJsonObject { put("stopReason", "end_turn") })
            }

            "session/cancel" -> Unit

            else -> respondError(id, -32601, "Method not found: $method")
        }
    }

    private suspend fun requestClient(method: String, params: JsonObject): JsonElement {
        val id = requestIds.incrementAndGet().toString()
        val deferred = CompletableDeferred<JsonElement>()
        clientResponses[id] = deferred
        send(
            buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", id)
                put("method", method)
                put("params", params)
            },
        )
        return withTimeout(10_000) { deferred.await() }
    }

    private fun completeClientResponse(message: JsonObject) {
        val id = (message["id"] as? JsonPrimitive)?.content ?: return
        val deferred = clientResponses.remove(id) ?: return
        val error = message["error"] as? JsonObject
        if (error != null) {
            deferred.completeExceptionally(
                IllegalStateException((error["message"] as? JsonPrimitive)?.content),
            )
        } else {
            deferred.complete(message["result"] ?: JsonNull)
        }
    }

    private suspend fun notifyUpdate(sessionId: String, text: String) {
        send(
            buildJsonObject {
                put("jsonrpc", "2.0")
                put("method", "session/update")
                putJsonObject("params") {
                    put("sessionId", sessionId)
                    putJsonObject("update") {
                        put("sessionUpdate", "agent_message_chunk")
                        put("text", text)
                    }
                }
            },
        )
    }

    private suspend fun respond(id: JsonElement, result: JsonElement) {
        send(
            buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", id)
                put("result", result)
            },
        )
    }

    private suspend fun respondError(id: JsonElement, code: Int, message: String) {
        send(
            buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", id)
                putJsonObject("error") {
                    put("code", code)
                    put("message", message)
                }
            },
        )
    }

    private suspend fun send(message: JsonObject) {
        writeLock.withLock {
            channel.agentOutput.write((message.toString() + "\n").toByteArray())
            channel.agentOutput.flush()
        }
    }
}

private fun JsonElement.string(key: String): String? =
    (this as? JsonObject)?.get(key)?.let { element ->
        (element as? JsonPrimitive)?.takeIf { value -> value !is JsonNull }?.content
    }
