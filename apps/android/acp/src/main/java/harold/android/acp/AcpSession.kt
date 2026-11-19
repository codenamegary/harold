package harold.android.acp

import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentReference
import harold.android.contracts.ConfigValue
import harold.android.contracts.ElicitationResolvedReason
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.SessionStreamServerMessage
import harold.android.contracts.SessionStreamServerMessage.Cancelled
import harold.android.contracts.SessionStreamServerMessage.ElicitationCompleted
import harold.android.contracts.SessionStreamServerMessage.ElicitationRequest
import harold.android.contracts.SessionStreamServerMessage.ElicitationResolved
import harold.android.contracts.SessionStreamServerMessage.Error
import harold.android.contracts.SessionStreamServerMessage.PermissionRequest
import harold.android.contracts.SessionStreamServerMessage.PromptComplete
import harold.android.contracts.SessionStreamServerMessage.SessionConfig
import harold.android.contracts.SessionStreamServerMessage.SessionInfo
import harold.android.contracts.SessionStreamServerMessage.SessionUpdate
import harold.android.contracts.SessionStreamServerMessage.StreamReset
import harold.android.contracts.SessionStreamServerMessage.Subscribed
import harold.android.network.PromptResult
import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentSessionGoneException
import harold.android.stream.SessionStatus
import java.io.Closeable
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
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

    private val pendingPermissions = ConcurrentHashMap<String, PendingInput>()
    private val pendingElicitations = ConcurrentHashMap<String, PendingInput>()
    private val urlElicitationRequests = ConcurrentHashMap<String, String>()
    private val prompting = AtomicBoolean(false)
    private val turnMutex = Mutex()
    private val attachMutex = Mutex()
    private val attachedOnce = AtomicBoolean(false)
    private val closeRequested = AtomicBoolean(false)
    private val nextSubscriberId = AtomicLong(0L)
    private val subscribers = ConcurrentHashMap<Long, Subscriber>()

    private val _status = MutableStateFlow(SessionStatus.Starting)
    val status: StateFlow<SessionStatus> = _status.asStateFlow()

    /**
     * Settles once per turn: [PromptResult.Accepted] when the agent answered,
     * [PromptResult.Interrupted] when the process died or timed out, and
     * [PromptResult.Failed] for a remote protocol failure.
     */
    private val _turnResults = MutableSharedFlow<PromptResult>(extraBufferCapacity = 1)
    val turnResults: SharedFlow<PromptResult> = _turnResults.asSharedFlow()

    val closed = CompletableDeferred<String?>()

    internal val isPrompting: Boolean
        get() = prompting.get()

    @Volatile
    private var title: String? = initialTitle

    /** Last title reported by the agent, for tombstones after the session is gone. */
    val currentTitle: String?
        get() = title

    @Volatile
    private var configOptions: List<JsonElement> = initialConfigOptions

    val isClosed: Boolean
        get() = closeRequested.get() || closed.isCompleted

    val capabilityInventory: AgentCapabilityInventory?
        get() = process.capabilities

    fun hasSubscribers(): Boolean = subscribers.isNotEmpty()

    fun hasWork(): Boolean =
        hasSubscribers() ||
            prompting.get() ||
            pendingPermissions.isNotEmpty() ||
            pendingElicitations.isNotEmpty()

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
                            error is AgentSessionGoneException -> SessionStatus.Gone
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
                // A backgrounded or switched-away stream can drop while the
                // agent is waiting for the user. Replay those requests to the
                // new subscriber instead of leaving the turn stuck.
                emitPendingInputs()
            }
        } catch (error: Throwable) {
            if (!process.isDead) {
                emitFrame(
                    Error(
                        message = error.message ?: "Could not attach to the session.",
                        agentId = agentId,
                        sessionId = sessionId,
                        sessionGone = error is AgentSessionGoneException,
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

    suspend fun prompt(body: PromptRequestBody): Result<PromptResult> {
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

        if (isClosed || process.isDead) {
            _status.value = SessionStatus.Offline
            return Result.success(PromptResult.Retryable)
        }

        // A second prompt waits for the current turn instead of failing. The
        // lock is released by the turn coroutine once the agent settles it.
        turnMutex.lock()
        var handedOff = false
        try {
            if (isClosed || process.isDead) {
                _status.value = SessionStatus.Offline
                return Result.success(PromptResult.Retryable)
            }
            prompting.set(true)
            val pending = try {
                process.beginPrompt(sessionId, prompt)
            } catch (error: CancellationException) {
                throw error
            } catch (_: AcpClosedException) {
                // The process died between the check and the write.
                _status.value = SessionStatus.Offline
                prompting.set(false)
                return Result.success(PromptResult.Retryable)
            } catch (_: Throwable) {
                // The bytes may have reached the agent before the write failed.
                prompting.set(false)
                return Result.success(PromptResult.Interrupted)
            }

            handedOff = true
            _status.value = SessionStatus.Running
            scope.launch(Dispatchers.IO) {
                val outcome = try {
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
                    PromptResult.Accepted
                } catch (error: TimeoutCancellationException) {
                    // The turn may have reached the agent; never replay it.
                    _status.value = if (process.isDead) {
                        SessionStatus.Offline
                    } else {
                        SessionStatus.Ready
                    }
                    PromptResult.Interrupted
                } catch (error: CancellationException) {
                    _status.value = SessionStatus.Offline
                    throw error
                } catch (error: Throwable) {
                    when {
                        process.isDead || error is AcpClosedException -> {
                            // onProcessClosed already told every subscriber;
                            // the turn only needs to settle its own state.
                            _status.value = SessionStatus.Offline
                            PromptResult.Interrupted
                        }

                        else -> {
                            emitFrame(
                                Error(
                                    message = error.message ?: "Prompt failed",
                                    agentId = agentId,
                                    sessionId = sessionId,
                                ),
                            )
                            _status.value = SessionStatus.Ready
                            PromptResult.Failed(
                                error.message?.takeIf { message -> message.isNotBlank() }
                                    ?: "Prompt failed",
                            )
                        }
                    }
                } finally {
                    prompting.set(false)
                    turnMutex.unlock()
                }
                _turnResults.tryEmit(outcome)
            }
            return Result.success(PromptResult.Accepted)
        } finally {
            if (!handedOff) {
                turnMutex.unlock()
            }
        }
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
        val pending = pendingPermissions.remove(requestId)
            ?: return Result.failure(
                IllegalStateException("Permission request is no longer active."),
            )
        pending.result.complete(
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
        val pending = pendingElicitations.remove(requestId)
            ?: return Result.failure(IllegalStateException("Elicitation is no longer active."))
        pending.result.complete(result)
        emitFrame(
            ElicitationResolved(
                requestId = requestId,
                agentId = agentId,
                sessionId = sessionId,
                reason = ElicitationResolvedReason.Replied,
                result = result,
            ),
        )
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
        val existing = pendingPermissions[id]
        val pending = existing ?: PendingInput(params = params).also { created ->
            pendingPermissions[id] = created
        }
        if (existing == null) {
            _status.value = SessionStatus.AwaitingPermission
            emitFrame(
                PermissionRequest(
                    requestId = id,
                    agentId = agentId,
                    sessionId = sessionId,
                    params = params,
                ),
            )
        }
        return try {
            withTimeout(PERMISSION_TIMEOUT_MILLIS) { pending.result.await() }
        } finally {
            pendingPermissions.remove(id, pending)
            clearSeenRequest(id)
            settleStatusAfterReply()
        }
    }

    internal suspend fun awaitElicitation(id: String, params: JsonElement): JsonElement {
        val existing = pendingElicitations[id]
        val pending = existing ?: PendingInput(params = params).also { created ->
            pendingElicitations[id] = created
            val elicitationId = params.string("elicitationId")
            if (elicitationId != null) {
                urlElicitationRequests[elicitationId] = id
            }
        }
        if (existing == null) {
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
        }
        return try {
            withTimeout(ELICITATION_TIMEOUT_MILLIS) { pending.result.await() }
        } finally {
            pendingElicitations.remove(id, pending)
            clearSeenRequest(id)
            settleStatusAfterReply()
        }
    }

    private fun emitPendingInputs() {
        pendingPermissions.forEach { (requestId, pending) ->
            emitFrame(
                PermissionRequest(
                    requestId = requestId,
                    agentId = agentId,
                    sessionId = sessionId,
                    params = pending.params,
                ),
            )
        }
        pendingElicitations.forEach { (requestId, pending) ->
            emitFrame(
                ElicitationRequest(
                    requestId = requestId,
                    agentId = agentId,
                    sessionId = sessionId,
                    params = pending.params,
                    expiresAt = Instant.now().plusSeconds(300).toString(),
                ),
            )
        }
    }

    /** Called by the owning process when the agent exits. */
    fun onProcessClosed(reason: String) {
        _status.value = SessionStatus.Offline
        // Tell attached streams before their channels close. Delivery is
        // best-effort even when a subscriber is not draining.
        emitFrame(
            Error(
                message = "The agent process stopped. Reopen the session to continue.",
                agentId = agentId,
                sessionId = sessionId,
            ),
        )
        closeSubscribers(reason)
        abandonPendingRequests()
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
        abandonPendingRequests()
        terminals.close()
        closed.complete(null)
    }

    private fun detach(id: Long, subscriber: Subscriber) {
        if (!subscribers.remove(id, subscriber)) {
            return
        }
        subscriber.channel.close()
        subscriber.closed.complete(null)
        // A stream detach is not a user cancel. Backgrounding, switching
        // sessions, or reopening a session must not stop a running turn or
        // discard a pending permission/question. cancel() remains explicit.
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
        pendingPermissions.values.forEach { pending -> pending.result.complete(cancelled) }
        pendingPermissions.clear()
        pendingElicitations.values.forEach { pending ->
            pending.result.complete(buildJsonObject { put("action", "cancel") })
        }
        pendingElicitations.clear()
        urlElicitationRequests.clear()
    }

    /**
     * Teardown is not the user declining. Complete the waiting coroutines with
     * a dropped-request signal so [AcpClient] writes no response, and leave the
     * host's pending request available for the next owner.
     */
    private fun abandonPendingRequests() {
        val dropped = AcpRequestDroppedException(
            "The session closed before the request was answered.",
        )
        pendingPermissions.values.forEach { pending ->
            pending.result.completeExceptionally(dropped)
        }
        pendingPermissions.clear()
        pendingElicitations.values.forEach { pending ->
            pending.result.completeExceptionally(dropped)
        }
        pendingElicitations.clear()
        urlElicitationRequests.clear()
    }

    private fun settleStatusAfterReply() {
        if (isClosed || process.isDead) {
            _status.value = SessionStatus.Offline
            return
        }
        _status.value = if (prompting.get()) {
            SessionStatus.Running
        } else {
            SessionStatus.Ready
        }
    }

    /**
     * Best-effort delivery that never blocks the shared agent-process
     * notification loop. A subscriber whose 256-message buffer is full is
     * disconnected so its owner reconnects and replays the session. Requests
     * are delivered once per subscriber; a replay after reattach fills in a
     * subscriber that missed the original frame.
     */
    private fun emitFrame(message: SessionStreamServerMessage) {
        val requestId = message.requestIdOrNull()
        subscribers.entries.toList().forEach { (id, subscriber) ->
            // Mark before send: the collector can resume from trySend and
            // trigger a replay before this loop reaches the next statement.
            if (requestId != null && !subscriber.seenRequests.add(requestId)) {
                return@forEach
            }
            val result = subscriber.channel.trySend(message)
            if (result.isSuccess || result.isClosed) {
                return@forEach
            }
            if (subscribers.remove(id, subscriber)) {
                subscriber.channel.close()
                subscriber.closed.complete(STREAM_FELL_BEHIND)
            }
        }
    }

    private fun clearSeenRequest(requestId: String) {
        subscribers.values.forEach { subscriber -> subscriber.seenRequests.remove(requestId) }
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

    private class PendingInput(
        val params: JsonElement,
        val result: CompletableDeferred<JsonElement> = CompletableDeferred(),
    )

    private class Subscriber(
        val channel: Channel<SessionStreamServerMessage>,
        val closed: CompletableDeferred<String?>,
        val seenRequests: MutableSet<String> = ConcurrentHashMap.newKeySet(),
    )

    companion object {
        private const val SUBSCRIBER_BUFFER = 256
        private const val PERMISSION_TIMEOUT_MILLIS = 30 * 60 * 1000L
        private const val ELICITATION_TIMEOUT_MILLIS = 30 * 60 * 1000L
        private const val PROMPT_TIMEOUT_MILLIS = 60 * 60 * 1000L
        private const val STREAM_FELL_BEHIND =
            "The stream fell behind. Reopen the session to continue."
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

private fun SessionStreamServerMessage.requestIdOrNull(): String? =
    when (this) {
        is PermissionRequest -> requestId
        is ElicitationRequest -> requestId
        else -> null
    }
