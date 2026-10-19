package harold.android.live

import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentReference
import harold.android.contracts.ConfigOption
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.SessionStreamServerMessage
import harold.android.contracts.catalogSessionKey
import harold.android.contracts.parseAvailableCommands
import harold.android.contracts.parseConfigOptions
import harold.android.di.ApplicationScope
import harold.android.live.composer.AvailableCommandsCatalog
import harold.android.live.composer.SessionConfigCatalog
import harold.android.network.SessionCommandApi
import harold.android.stream.ConnectionSignal
import harold.android.stream.ConnectionState
import harold.android.stream.ConnectionStatus
import harold.android.stream.DisconnectCause
import harold.android.stream.ReconnectPolicy
import harold.android.stream.SessionStream
import harold.android.stream.SessionStreamFactory
import harold.android.stream.SessionStreamHandlers
import harold.android.stream.reduce
import javax.inject.Inject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.select
import kotlinx.serialization.json.JsonElement

/**
 * One event stream, one unbounded inbox, one pump. Chat never sees a raw
 * frame. Commands do not travel on the stream: they are REST calls through
 * [SessionCommandApi], so each one succeeds or fails on its own.
 */
class DefaultSessionOwner @Inject constructor(
    private val streamFactory: SessionStreamFactory,
    private val commandApi: SessionCommandApi,
    @ApplicationScope private val scope: CoroutineScope,
) : SessionOwner {
    private val lock = Any()
    private val commandsCatalog = AvailableCommandsCatalog()
    private val configCatalog = SessionConfigCatalog()

    private val _connectionState = MutableStateFlow(ConnectionState())
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _snapshot = MutableStateFlow(SessionSnapshot())
    override val snapshot: StateFlow<SessionSnapshot> = _snapshot.asStateFlow()

    private val _sessionTitles = MutableStateFlow<Map<String, String>>(emptyMap())
    override val sessionTitles: StateFlow<Map<String, String>> = _sessionTitles.asStateFlow()

    private val _promptCompletions = MutableSharedFlow<Unit>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    override val promptCompletions: Flow<Unit> = _promptCompletions.asSharedFlow()

    @Volatile
    private var inbox = Channel<SessionStreamServerMessage>(Channel.UNLIMITED)
    private var pump: Job? = null

    private var loop: Job? = null
    private var serverOrigin: String? = null
    private var stream: SessionStream? = null
    private var watchAgentId: AgentId? = null
    private var watchSessionId: String? = null
    private var pendingPrompt: String? = null
    private var turnSerial: Int = 0

    /**
     * Wakes the connect loop whenever the watch target changes. Conflated: a
     * change arriving mid-backoff or mid-read is picked up at the next wait
     * point, and a stale notification is ignored when the loop already
     * reopened for the new target.
     */
    private val watchChanges = Channel<Unit>(capacity = Channel.CONFLATED)

    private data class WatchTarget(val agentId: AgentId, val sessionId: String)

    private fun currentWatchTarget(): WatchTarget? {
        synchronized(lock) {
            val agentId = watchAgentId ?: return null
            val sessionId = watchSessionId ?: return null
            return WatchTarget(agentId = agentId, sessionId = sessionId)
        }
    }

    override fun connect(serverOrigin: String) {
        if (this.serverOrigin == serverOrigin && loop?.isActive == true) {
            // Already connecting/live/reconnecting toward this server: tearing
            // the loop down would kill a healthy stream. `retry()` only lands
            // here when the loop has stopped (AuthFailed/TransportError).
            synchronized(lock) {
                ensurePumpLocked()
            }
            return
        }

        val movedServer = this.serverOrigin?.let { it != serverOrigin } ?: false

        this.serverOrigin = serverOrigin
        loop?.cancel()
        stream?.close()
        stream = null

        if (movedServer) {
            _connectionState.value = ConnectionState()
            synchronized(lock) {
                resetWatchLocked(clearCatalog = true)
            }
        }

        synchronized(lock) {
            ensurePumpLocked()
        }
        loop = scope.launch { run(serverOrigin) }
    }

    override fun retry() {
        val origin = serverOrigin ?: return

        connect(origin)
    }

    override fun disconnect() {
        loop?.cancel()
        loop = null
        stream?.close()
        stream = null
        synchronized(lock) {
            pump?.cancel()
            pump = null
            inbox.close()
            inbox = Channel(Channel.UNLIMITED)
            pendingPrompt = null
            watchAgentId = null
            watchSessionId = null
            commandsCatalog.clear()
            configCatalog.clear()
            _sessionTitles.value = emptyMap()
            _snapshot.value = SessionSnapshot()
        }
        _connectionState.update { current -> current.copy(status = ConnectionStatus.Idle) }
    }

    override fun watch(agentId: AgentId?, sessionId: String?) {
        val normalizedSession = sessionId?.takeIf { it.isNotEmpty() }
        synchronized(lock) {
            if (watchAgentId == agentId && watchSessionId == normalizedSession) {
                // Same target: the reconnect loop re-opens with it, so there
                // is nothing to resend on a fresh stream.
                return
            }
            replaceInboxLocked()
            pendingPrompt = null
            watchAgentId = agentId
            watchSessionId = normalizedSession
            _snapshot.value = emptyLiveSnapshotLocked(reconnecting = false)
        }
        watchChanges.trySend(Unit)
    }

    override suspend fun prompt(text: String, attachments: List<AttachmentReference>): Result<Unit> {
        val agentId: AgentId
        val sessionId: String
        val origin: String
        val live: Boolean
        synchronized(lock) {
            val targetAgent = watchAgentId
                ?: return Result.failure(IllegalStateException("No session is being watched"))
            val targetSession = watchSessionId
                ?: return Result.failure(IllegalStateException("No session is being watched"))
            val targetOrigin = serverOrigin
                ?: return Result.failure(IllegalStateException("Not connected to a server"))
            agentId = targetAgent
            sessionId = targetSession
            origin = targetOrigin
            val turnId = nextTurnIdLocked()
            _snapshot.update { current ->
                current.copy(
                    transcript = beginUserTurn(
                        current.transcript,
                        turnId,
                        text,
                        attachments.map { it.name },
                    ),
                    reconnecting = false,
                )
            }
            live = _snapshot.value.transcript.live
            if (!live) {
                pendingPrompt = text
            }
        }
        if (!live) {
            // Held until `subscribed`; the flush posts it on the command API.
            return Result.success(Unit)
        }
        return commandApi.prompt(origin, agentId, sessionId, PromptRequestBody(text, attachments))
    }

    override suspend fun cancel(): Result<Unit> {
        val agentId: AgentId
        val sessionId: String
        val origin: String
        synchronized(lock) {
            origin = serverOrigin
                ?: return Result.failure(IllegalStateException("Not connected to a server"))
            agentId = watchAgentId
                ?: return Result.failure(IllegalStateException("No session is being watched"))
            sessionId = watchSessionId
                ?: return Result.failure(IllegalStateException("No session is being watched"))
        }
        return commandApi.cancel(origin, agentId, sessionId)
    }

    override suspend fun replyPermission(requestId: String, optionId: String): Result<Unit> {
        val origin: String
        synchronized(lock) {
            origin = serverOrigin
                ?: return Result.failure(IllegalStateException("Not connected to a server"))
            _snapshot.update { current ->
                current.copy(
                    transcript = applyPermissionResolved(current.transcript),
                    pendingPermission = null,
                )
            }
        }
        return commandApi.replyPermission(origin, requestId, optionId)
    }

    override suspend fun replyExtension(requestId: String, result: JsonElement): Result<Unit> {
        val origin: String
        synchronized(lock) {
            origin = serverOrigin
                ?: return Result.failure(IllegalStateException("Not connected to a server"))
            _snapshot.update { current ->
                current.copy(extension = null)
            }
        }
        return commandApi.replyExtension(origin, requestId, result)
    }

    override fun rememberConfig(agentId: AgentId, sessionId: String, configOptions: List<ConfigOption>) {
        if (sessionId.isEmpty() || configOptions.isEmpty()) {
            return
        }
        synchronized(lock) {
            configCatalog.remember(agentId, sessionId, configOptions)
            if (belongsToWatchLocked(agentId, sessionId)) {
                _snapshot.update { current ->
                    current.copy(configOptions = configOptions)
                }
            }
        }
    }

    override fun forget(agentId: AgentId, sessionId: String) {
        synchronized(lock) {
            commandsCatalog.forget(agentId, sessionId)
            configCatalog.forget(agentId, sessionId)
            _sessionTitles.update { titles -> titles - catalogSessionKey(agentId, sessionId) }
            if (watchAgentId == agentId && watchSessionId == sessionId) {
                _snapshot.update { current ->
                    current.copy(
                        availableCommands = emptyList(),
                        configOptions = emptyList(),
                    )
                }
            }
        }
    }

    private suspend fun run(serverOrigin: String) {
        var reconnect = false

        while (currentCoroutineContext().isActive) {
            val target = currentWatchTarget()
            if (target == null) {
                // The events URL carries the session, so there is no stream
                // to open until something is watched. Park idle instead of
                // claiming a connection attempt that cannot start.
                applyConnection(ConnectionSignal.Idle)
                watchChanges.receive()
                continue
            }

            applyConnection(ConnectionSignal.ConnectRequested)

            if (reconnect) {
                synchronized(lock) {
                    replaceInboxLocked()
                    pendingPrompt = null
                    _snapshot.value = emptyLiveSnapshotLocked(reconnecting = true)
                }
            }

            val closed = CompletableDeferred<DisconnectCause>()
            val active = streamFactory.open(
                serverOrigin = serverOrigin,
                agentId = target.agentId,
                sessionId = target.sessionId,
                handlers = SessionStreamHandlers(
                    onMessage = ::enqueueFrame,
                    onOpen = { applyConnection(ConnectionSignal.Connected) },
                    onDisconnect = { cause -> closed.complete(cause) },
                ),
            )
            stream = active

            // Wait for a disconnect or a watch change; a stale notification
            // (the loop already reopened for the new target) keeps waiting.
            try {
                var disconnectCause: DisconnectCause? = null
                while (disconnectCause == null) {
                    val event = select {
                        closed.onAwait { it }
                        watchChanges.onReceive { null }
                    }
                    if (event != null) {
                        disconnectCause = event
                    } else if (currentWatchTarget() != target) {
                        break
                    }
                }

                if (disconnectCause == null) {
                    // Watch target changed: re-open immediately, no backoff.
                    reconnect = false
                    continue
                }

                applyConnection(ConnectionSignal.Disconnected(disconnectCause))

                val status = _connectionState.value.status
                if (status !is ConnectionStatus.Reconnecting) {
                    synchronized(lock) {
                        pump?.cancel()
                        pump = null
                    }
                    return
                }

                delay(ReconnectPolicy.delayMillis(status.attempt))
                reconnect = true
            } finally {
                // Runs on every exit: watch change, disconnect, terminal
                // status, or loop cancellation mid-wait. Without it a
                // cancelled iteration leaks the open stream (and its server
                // side hub subscriber) until the socket dies on its own.
                active.close()
                if (stream === active) {
                    stream = null
                }
            }
        }
    }

    private fun enqueueFrame(message: SessionStreamServerMessage) {
        val result = inbox.trySend(message)
        if (result.isSuccess || result.isClosed) {
            return
        }
        stream?.close()
    }

    private fun applyFrame(message: SessionStreamServerMessage) {
        synchronized(lock) {
            when (message) {
                is SessionStreamServerMessage.SessionUpdate -> {
                    if (!belongsToWatchLocked(message.agentId, message.sessionId)) {
                        return
                    }
                    val commands = parseAvailableCommands(message.update)
                    if (commands != null) {
                        commandsCatalog.remember(message.agentId, message.sessionId, commands)
                        _snapshot.update { current ->
                            current.copy(
                                availableCommands = commands,
                                reconnecting = false,
                            )
                        }
                        return
                    }
                    _snapshot.update { current ->
                        current.copy(
                            transcript = foldAcpUpdate(
                                current.transcript,
                                parseAcpUpdate(message.update),
                            ),
                            reconnecting = false,
                        )
                    }
                }
                is SessionStreamServerMessage.SessionConfig -> {
                    if (!belongsToWatchLocked(message.agentId, message.sessionId)) {
                        return
                    }
                    val options = parseConfigOptions(message.configOptions)
                    configCatalog.remember(message.agentId, message.sessionId, options)
                    _snapshot.update { current ->
                        current.copy(
                            configOptions = options,
                            reconnecting = false,
                        )
                    }
                }

                is SessionStreamServerMessage.Subscribed -> {
                    if (!belongsToWatchLocked(message.agentId, message.sessionId)) {
                        return
                    }
                    _snapshot.update { current ->
                        current.copy(
                            transcript = applySubscribed(current.transcript),
                            reconnecting = false,
                        )
                    }
                    val queued = pendingPrompt
                    pendingPrompt = null
                    if (queued != null) {
                        val origin = serverOrigin
                        if (origin != null) {
                            scope.launch {
                                commandApi.prompt(
                                    origin,
                                    message.agentId,
                                    message.sessionId,
                                    PromptRequestBody(queued),
                                )
                            }
                        }
                    }
                }
                is SessionStreamServerMessage.PromptComplete -> {
                    if (!belongsToWatchLocked(message.agentId, message.sessionId)) {
                        return
                    }
                    _snapshot.update { current ->
                        current.copy(transcript = applyPromptComplete(current.transcript))
                    }
                    _promptCompletions.tryEmit(Unit)
                }
                is SessionStreamServerMessage.Cancelled -> {
                    if (!belongsToWatchLocked(message.agentId, message.sessionId)) {
                        return
                    }
                    _snapshot.update { current ->
                        current.copy(transcript = applyCancelled(current.transcript))
                    }
                }
                is SessionStreamServerMessage.PermissionRequest -> {
                    if (!belongsToWatchLocked(message.agentId, message.sessionId)) {
                        return
                    }
                    val parsed = parseStreamPermission(
                        requestId = message.requestId,
                        sessionId = message.sessionId,
                        params = message.params,
                    ) ?: return
                    _snapshot.update { current ->
                        current.copy(
                            pendingPermission = parsed,
                            transcript = applyPermissionRequested(current.transcript),
                        )
                    }
                }
                is SessionStreamServerMessage.ExtensionRequest -> {
                    if (!belongsToWatchLocked(message.agentId, message.sessionId)) {
                        return
                    }
                    _snapshot.update { current ->
                        current.copy(
                            extension = StreamExtension(
                                requestId = message.requestId,
                                method = message.method,
                                params = message.params,
                            ),
                        )
                    }
                }
                is SessionStreamServerMessage.Error -> {
                    if (
                        message.sessionId != null &&
                        message.sessionId != watchSessionId
                    ) {
                        return
                    }
                    if (watchSessionId == null) {
                        return
                    }
                    _snapshot.update { current ->
                        current.copy(
                            transcript = applyStreamError(current.transcript),
                            authRequired = isAuthRequiredError(message.message),
                            reconnecting = false,
                        )
                    }
                }
                is SessionStreamServerMessage.AuthSessionUpdated -> {
                    if (watchAgentId == null || watchAgentId != message.agentId) {
                        return
                    }
                    _snapshot.update { current ->
                        current.copy(
                            agentAuth = message.auth,
                            authRequired = false,
                        )
                    }
                }
                is SessionStreamServerMessage.SessionInfo -> {
                    // The server sends renames for every session to every
                    // client, so this skips the watch filter.
                    applySessionTitleLocked(message.agentId, message.sessionId, message.title)
                }
            }
        }
    }

    private fun startPump() {
        val channel = inbox
        pump = scope.launch {
            for (frame in channel) {
                applyFrame(frame)
            }
        }
    }

    private fun ensurePumpLocked() {
        if (pump?.isActive == true) {
            return
        }
        startPump()
    }

    private fun replaceInboxLocked() {
        pump?.cancel()
        inbox = Channel(Channel.UNLIMITED)
        startPump()
    }

    private fun resetWatchLocked(clearCatalog: Boolean) {
        replaceInboxLocked()
        pendingPrompt = null
        watchAgentId = null
        watchSessionId = null
        if (clearCatalog) {
            commandsCatalog.clear()
            configCatalog.clear()
            _sessionTitles.value = emptyMap()
        }
        _snapshot.value = SessionSnapshot()
    }

    private fun emptyLiveSnapshotLocked(reconnecting: Boolean): SessionSnapshot {
        val agentId = watchAgentId
        val sessionId = watchSessionId
        return SessionSnapshot(
            agentId = agentId,
            sessionId = sessionId,
            transcript = if (reconnecting) applyReconnect() else emptyAcpTranscript,
            reconnecting = reconnecting,
            availableCommands = commandsCatalog.current(agentId, sessionId),
            configOptions = configCatalog.current(agentId, sessionId),
        )
    }

    private fun belongsToWatchLocked(agentId: AgentId, sessionId: String): Boolean =
        watchAgentId == agentId && watchSessionId == sessionId

    private fun applySessionTitleLocked(agentId: AgentId, sessionId: String, title: String?) {
        val key = catalogSessionKey(agentId, sessionId)
        val current = _sessionTitles.value
        val next = if (title == null) current - key else current + (key to title)
        if (next != current) {
            _sessionTitles.value = next
        }
    }

    private fun nextTurnIdLocked(): String {
        turnSerial += 1
        return "turn-$turnSerial"
    }

    private fun applyConnection(signal: ConnectionSignal) {
        _connectionState.update { current -> reduce(current, signal) }
    }

    private fun isAuthRequiredError(message: String): Boolean {
        val lower = message.lowercase()
        return lower.contains("agent authentication required") ||
            lower.contains("auth_required")
    }
}
