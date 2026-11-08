package harold.android.acp

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
import harold.android.contracts.SessionStreamServerMessage.StreamReset
import harold.android.contracts.SessionStreamServerMessage.Subscribed
import harold.android.process.AgentAuthRequiredException
import harold.android.stream.SessionStatus
import java.io.Closeable
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * One ACP session hosted by an [AgentProcess]. Closing a stream detaches a
 * subscriber; it never closes this object or the process. Attaching again
 * reloads the agent's history with `session/load` and a [StreamReset].
 */
class AcpSession internal constructor(
    val connectionId: String,
    val agentId: AgentId,
    val sessionId: String,
    val cwd: String,
    private val created: Boolean,
    initialTitle: String?,
    initialConfigOptions: List<JsonElement>,
    private val process: AgentProcess,
    private val catalog: AcpSessionCatalog,
    private val scope: CoroutineScope,
) : Closeable {
    internal val terminals = AcpTerminals(connectionId, process.launcher, scope)

    private val pendingPermissions = ConcurrentHashMap<String, CompletableDeferred<JsonElement>>()
    private val pendingElicitations = ConcurrentHashMap<String, CompletableDeferred<JsonElement>>()
    private val urlElicitationRequests = ConcurrentHashMap<String, String>()
    private val prompting = AtomicBoolean(false)
    private val promptWriteMutex = Mutex()
    private val attachMutex = Mutex()
    private val attachedOnce = AtomicBoolean(false)
    private val closeRequested = AtomicBoolean(false)
    private val nextSubscriberId = AtomicLong(0L)
    private val subscribers = ConcurrentHashMap<Long, Subscriber>()

    private val _status = MutableStateFlow(SessionStatus.Starting)
    val status: StateFlow<SessionStatus> = _status.asStateFlow()

    val closed = CompletableDeferred<String?>()

    @Volatile
    private var title: String? = initialTitle

    @Volatile
    private var configOptions: List<JsonElement> = initialConfigOptions

    val isClosed: Boolean
        get() = closeRequested.get() || closed.isCompleted

    val capabilityInventory: AgentCapabilityInventory?
        get() = process.capabilities

    fun hasSubscribers(): Boolean = subscribers.isNotEmpty()

    fun hasWork(): Boolean = hasSubscribers() || prompting.get()

    /**
     * Registers a bounded subscriber channel and starts the attach sequence
     * (`session/load` when this is a reattach). The reload runs beside the
     * stream collector so a long replay cannot fill the bounded buffer before
     * the stream starts draining it.
     */
    suspend fun attach(): AcpSessionSubscription {
        if (isClosed) {
            error("The session is closed.")
        }
        if (process.isDead) {
            _status.value = SessionStatus.Offline
            throw AcpClosedException(process.closedReason ?: "The agent process is not running.")
        }

        val id = nextSubscriberId.incrementAndGet()
        val channel = Channel<SessionStreamServerMessage>(capacity = SUBSCRIBER_BUFFER)
        val closedSignal = CompletableDeferred<String?>()
        val subscriber = Subscriber(channel = channel, closed = closedSignal)
        subscribers[id] = subscriber
        val subscription = AcpSessionSubscription(
            events = channel.receiveAsFlow(),
            closed = closedSignal,
        ) {
            detach(id, subscriber)
        }
        scope.launch(Dispatchers.IO) {
            runAttach(id, subscriber)
        }
        return subscription
    }

    private suspend fun runAttach(id: Long, subscriber: Subscriber) {
        try {
            attachMutex.withLock {
                if (!subscribers.containsKey(id)) {
                    return
                }
                val reload = !attachedOnce.compareAndSet(false, true) || !created
                if (reload) {
                    _status.value = SessionStatus.Reloading
                    emitFrame(
                        StreamReset(agentId = agentId, sessionId = sessionId),
                    )
                    val loadedOptions = try {
                        process.sessionLoad(this, cwd)
                    } catch (error: Throwable) {
                        _status.value = when {
                            error is AgentAuthRequiredException -> SessionStatus.AuthFailed
                            process.isDead -> SessionStatus.Offline
                            else -> SessionStatus.Error
                        }
                        throw error
                    }
                    configOptions = loadedOptions
                    if (loadedOptions.isNotEmpty()) {
                        emitFrame(
                            SessionConfig(
                                agentId = agentId,
                                sessionId = sessionId,
                                configOptions = loadedOptions,
                            ),
                        )
                    }
                    title?.let { currentTitle ->
                        emitFrame(
                            SessionInfo(
                                agentId = agentId,
                                sessionId = sessionId,
                                title = currentTitle,
                            ),
                        )
                    }
                } else {
                    emitFrame(
                        StreamReset(agentId = agentId, sessionId = sessionId),
                    )
                    if (configOptions.isNotEmpty()) {
                        emitFrame(
                            SessionConfig(
                                agentId = agentId,
                                sessionId = sessionId,
                                configOptions = configOptions,
                            ),
                        )
                    }
                    title?.let { currentTitle ->
                        emitFrame(
                            SessionInfo(
                                agentId = agentId,
                                sessionId = sessionId,
                                title = currentTitle,
                            ),
                        )
                    }
                }
                if (process.isDead) {
                    _status.value = SessionStatus.Offline
                    return
                }
                _status.value = SessionStatus.Ready
                emitFrame(Subscribed(agentId = agentId, sessionId = sessionId))
            }
        } catch (error: Throwable) {
            if (!process.isDead) {
                tryEmitFrame(
                    Error(
                        message = error.message ?: "Could not attach to the session.",
                        agentId = agentId,
                        sessionId = sessionId,
                    ),
                )
            }
            failSubscriber(id, subscriber, error)
        }
    }

    private fun failSubscriber(id: Long, subscriber: Subscriber, error: Throwable) {
        if (!subscribers.remove(id, subscriber)) {
            return
        }
        subscriber.channel.close()
        subscriber.closed.complete(
            error.message ?: "Could not attach to the session.",
        )
    }

    /** Removes [subscription] without touching the process. */
    fun detach(subscription: AcpSessionSubscription) {
        subscription.detach()
    }

    fun detachAll() {
        subscribers.keys.toList().forEach { id ->
            subscribers[id]?.let { subscriber -> detach(id, subscriber) }
        }
    }

    suspend fun prompt(body: PromptRequestBody): Result<Unit> = promptWriteMutex.withLock {
        if (isClosed || process.isDead) {
            _status.value = SessionStatus.Offline
            return@withLock Result.failure(
                AcpClosedException(process.closedReason ?: "The agent process is not running."),
            )
        }
        if (!prompting.compareAndSet(false, true)) {
            return@withLock Result.failure(IllegalStateException("A turn is already running."))
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

        val pending = try {
            process.beginPrompt(sessionId, prompt)
        } catch (error: Throwable) {
            prompting.set(false)
            return@withLock Result.failure(error)
        }

        _status.value = SessionStatus.Running
        scope.launch(Dispatchers.IO) {
            try {
                val response = pending.await(PROMPT_TIMEOUT_MILLIS)
                val stopReason = response.string("stopReason")
                if (stopReason == "cancelled") {
                    emitFrame(Cancelled(agentId = agentId, sessionId = sessionId))
                } else {
                    emitFrame(PromptComplete(agentId = agentId, sessionId = sessionId))
                }
                if (!process.isDead) {
                    _status.value = SessionStatus.Ready
                }
            } catch (error: Throwable) {
                if (process.isDead || error is AcpClosedException) {
                    // onProcessClosed already told every subscriber; the turn
                    // only needs to settle its own state.
                    _status.value = SessionStatus.Offline
                } else {
                    emitFrame(
                        Error(
                            message = error.message ?: "Prompt failed",
                            agentId = agentId,
                            sessionId = sessionId,
                        ),
                    )
                    _status.value = SessionStatus.Ready
                }
            } finally {
                prompting.set(false)
            }
        }
        Result.success(Unit)
    }

    suspend fun cancel(): Result<Unit> = runCatching {
        process.cancelSession(sessionId)
        cancelPendingRequests()
    }

    fun hasPermission(requestId: String): Boolean = pendingPermissions.containsKey(requestId)

    fun hasElicitation(requestId: String): Boolean = pendingElicitations.containsKey(requestId)

    internal fun ownsElicitation(elicitationId: String): Boolean =
        urlElicitationRequests.containsKey(elicitationId)

    suspend fun replyPermission(requestId: String, optionId: String): Result<Unit> {
        val deferred = pendingPermissions.remove(requestId)
            ?: return Result.failure(
                IllegalStateException("Permission request is no longer active."),
            )
        deferred.complete(
            buildJsonObject {
                putJsonObject("outcome") {
                    put("outcome", "selected")
                    put("optionId", optionId)
                }
            },
        )
        settleStatusAfterReply()
        return Result.success(Unit)
    }

    suspend fun replyElicitation(requestId: String, result: JsonElement): Result<Unit> {
        val deferred = pendingElicitations.remove(requestId)
            ?: return Result.failure(IllegalStateException("Elicitation is no longer active."))
        deferred.complete(result)
        settleStatusAfterReply()
        return Result.success(Unit)
    }

    suspend fun setConfigOption(configId: String, value: ConfigValue): Result<Unit> =
        runCatching {
            val response = process.request(
                sessionId = sessionId,
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
            val updatedOptions = (responseObject?.get("configOptions") as? JsonArray)
                ?.map { element -> element }
                .orEmpty()
            configOptions = updatedOptions
            emitFrame(
                SessionConfig(
                    agentId = agentId,
                    sessionId = sessionId,
                    configOptions = updatedOptions,
                ),
            )
        }

    internal suspend fun handleUpdate(params: JsonElement) {
        val update = (params as? JsonObject)?.get("update") as? JsonObject ?: return
        val infoUpdate = parseSessionInfoUpdate(update)
        if (infoUpdate != null) {
            catalog.updateInfo(connectionId, agentId, sessionId, infoUpdate)
            if (infoUpdate.titleChanged) {
                title = infoUpdate.title
                emitFrame(
                    SessionInfo(
                        agentId = agentId,
                        sessionId = sessionId,
                        title = infoUpdate.title,
                    ),
                )
            }
            return
        }
        emitFrame(
            SessionUpdate(
                agentId = agentId,
                sessionId = sessionId,
                update = update,
            ),
        )
    }

    internal suspend fun handleElicitationComplete(params: JsonElement) {
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

    internal suspend fun awaitPermission(id: String, params: JsonElement): JsonElement {
        val deferred = CompletableDeferred<JsonElement>()
        pendingPermissions[id] = deferred
        _status.value = SessionStatus.AwaitingPermission
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
            settleStatusAfterReply()
        }
    }

    internal suspend fun awaitElicitation(id: String, params: JsonElement): JsonElement {
        val deferred = CompletableDeferred<JsonElement>()
        pendingElicitations[id] = deferred
        val elicitationId = params.string("elicitationId")
        if (elicitationId != null) {
            urlElicitationRequests[elicitationId] = id
        }
        _status.value = SessionStatus.AwaitingAnswer
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
            settleStatusAfterReply()
        }
    }

    /** Called by the owning process when the agent exits. */
    fun onProcessClosed(reason: String) {
        _status.value = SessionStatus.Offline
        // Tell attached streams before their channels close. trySend keeps
        // this best-effort even when a subscriber is not draining.
        tryEmitFrame(
            Error(
                message = "The agent process stopped. Reopen the session to continue.",
                agentId = agentId,
                sessionId = sessionId,
            ),
        )
        closeSubscribers(reason)
        cancelPendingRequests()
        terminals.close()
    }

    /**
     * Delete/restart teardown only. Stream closes detach instead of calling
     * this.
     */
    override fun close() {
        if (!closeRequested.compareAndSet(false, true)) {
            return
        }
        _status.value = SessionStatus.Offline
        process.removeSession(this)
        closeSubscribers(null)
        cancelPendingRequests()
        terminals.close()
        closed.complete(null)
    }

    private fun detach(id: Long, subscriber: Subscriber) {
        if (!subscribers.remove(id, subscriber)) {
            return
        }
        subscriber.channel.close()
        subscriber.closed.complete(null)
        if (subscribers.isEmpty() && prompting.get()) {
            scope.launch {
                runCatching { process.cancelSession(sessionId) }
            }
            cancelPendingRequests()
        }
    }

    private fun closeSubscribers(reason: String?) {
        val current = subscribers.values.toList()
        subscribers.clear()
        current.forEach { subscriber ->
            subscriber.channel.close()
            subscriber.closed.complete(reason)
        }
    }

    private fun cancelPendingRequests() {
        val cancelled = buildJsonObject {
            putJsonObject("outcome") { put("outcome", "cancelled") }
        }
        pendingPermissions.values.forEach { deferred -> deferred.complete(cancelled) }
        pendingPermissions.clear()
        pendingElicitations.values.forEach { deferred ->
            deferred.complete(buildJsonObject { put("action", "cancel") })
        }
        pendingElicitations.clear()
        urlElicitationRequests.clear()
    }

    private fun settleStatusAfterReply() {
        if (process.isDead) {
            _status.value = SessionStatus.Offline
            return
        }
        _status.value = if (prompting.get()) {
            SessionStatus.Running
        } else {
            SessionStatus.Ready
        }
    }

    private suspend fun emitFrame(message: SessionStreamServerMessage) {
        subscribers.values.toList().forEach { subscriber ->
            try {
                subscriber.channel.send(message)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                // The subscriber detached while this frame was in flight.
            }
        }
    }

    private fun tryEmitFrame(message: SessionStreamServerMessage) {
        subscribers.values.toList().forEach { subscriber ->
            subscriber.channel.trySend(message)
        }
    }

    private suspend fun contentBlock(reference: AttachmentReference): JsonObject =
        when (reference.kind) {
            AttachmentKind.Image -> {
                val bytes = process.readBytes(reference.path)
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

    private class Subscriber(
        val channel: Channel<SessionStreamServerMessage>,
        val closed: CompletableDeferred<String?>,
    )

    companion object {
        private const val SUBSCRIBER_BUFFER = 256
        private const val PERMISSION_TIMEOUT_MILLIS = 30 * 60 * 1000L
        private const val ELICITATION_TIMEOUT_MILLIS = 30 * 60 * 1000L
        private const val PROMPT_TIMEOUT_MILLIS = 60 * 60 * 1000L
    }
}

/**
 * One attached stream's view of a session. [closed] completes with the death
 * reason when the process exits; a caller-initiated detach completes it with
 * null.
 */
class AcpSessionSubscription internal constructor(
    val events: Flow<SessionStreamServerMessage>,
    val closed: CompletableDeferred<String?>,
    private val onDetach: () -> Unit,
) {
    private val detached = AtomicBoolean(false)

    fun detach() {
        if (detached.compareAndSet(false, true)) {
            onDetach()
        }
    }
}

private fun JsonElement.string(key: String): String? =
    ((this as? JsonObject)?.get(key) as? JsonPrimitive)?.content
