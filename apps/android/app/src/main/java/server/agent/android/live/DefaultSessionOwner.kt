package server.agent.android.live

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import server.agent.android.chat.StreamExtension
import server.agent.android.chat.applyCancelled
import server.agent.android.chat.applyPermissionRequested
import server.agent.android.chat.applyPermissionResolved
import server.agent.android.chat.applyPromptComplete
import server.agent.android.chat.applyReconnect
import server.agent.android.chat.applyStreamError
import server.agent.android.chat.applySubscribed
import server.agent.android.chat.beginUserTurn
import server.agent.android.chat.composer.AvailableCommandsCatalog
import server.agent.android.chat.emptyAcpTranscript
import server.agent.android.chat.foldAcpUpdate
import server.agent.android.chat.parseAcpUpdate
import server.agent.android.chat.parseStreamPermission
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage
import server.agent.android.contracts.catalogSessionKey
import server.agent.android.contracts.parseAvailableCommands
import server.agent.android.events.ConnectionSignal
import server.agent.android.events.ConnectionState
import server.agent.android.events.ConnectionStatus
import server.agent.android.events.DisconnectCause
import server.agent.android.events.ReconnectPolicy
import server.agent.android.events.SessionStream
import server.agent.android.events.SessionStreamFactory
import server.agent.android.events.SessionStreamHandlers
import server.agent.android.events.reduce

/**
 * One socket, one unbounded inbox, one pump. Chat never sees a raw frame.
 */
class DefaultSessionOwner(
    private val streamFactory: SessionStreamFactory,
    private val scope: CoroutineScope,
) : SessionOwner {
    private val lock = Any()
    private val commandsCatalog = AvailableCommandsCatalog()

    private val _connectionState = MutableStateFlow(ConnectionState())
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _snapshot = MutableStateFlow(SessionSnapshot())
    override val snapshot: StateFlow<SessionSnapshot> = _snapshot.asStateFlow()

    @Volatile
    private var inbox = Channel<SessionStreamServerMessage>(Channel.UNLIMITED)
    private var pump: Job? = null

    private var loop: Job? = null
    private var serverOrigin: String? = null
    private var stream: SessionStream? = null
    private var watchAgentId: AgentId? = null
    private var watchSessionId: String? = null
    private var subscribedKey: String? = null
    private var pendingPrompt: String? = null
    private var turnSerial: Int = 0

    override fun connect(serverOrigin: String) {
        val movedServer = this.serverOrigin?.let { it != serverOrigin } ?: false

        this.serverOrigin = serverOrigin
        loop?.cancel()
        stream?.close()
        stream = null
        subscribedKey = null

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
            subscribedKey = null
            commandsCatalog.clear()
            _snapshot.value = SessionSnapshot()
        }
        _connectionState.update { current -> current.copy(status = ConnectionStatus.Idle) }
    }

    override fun watch(agentId: AgentId?, sessionId: String?) {
        val normalizedSession = sessionId?.takeIf { it.isNotEmpty() }
        synchronized(lock) {
            if (watchAgentId == agentId && watchSessionId == normalizedSession) {
                // Same target. Resend subscribe if the socket just came up.
            } else {
                replaceInboxLocked()
                pendingPrompt = null
                watchAgentId = agentId
                watchSessionId = normalizedSession
                _snapshot.value = emptyLiveSnapshotLocked(reconnecting = false)
            }
        }
        sendSubscribeForTarget()
    }

    override fun prompt(text: String) {
        val agentId: AgentId
        val sessionId: String
        val live: Boolean
        synchronized(lock) {
            agentId = watchAgentId ?: return
            sessionId = watchSessionId ?: return
            val turnId = nextTurnIdLocked()
            _snapshot.update { current ->
                current.copy(
                    transcript = beginUserTurn(current.transcript, turnId, text),
                    reconnecting = false,
                )
            }
            live = _snapshot.value.transcript.live
            if (!live) {
                pendingPrompt = text
            }
        }
        if (live) {
            stream?.send(
                SessionStreamClientMessage.Prompt(
                    agentId = agentId,
                    sessionId = sessionId,
                    text = text,
                ),
            )
        }
    }

    override fun cancel() {
        val agentId: AgentId
        val sessionId: String
        synchronized(lock) {
            agentId = watchAgentId ?: return
            sessionId = watchSessionId ?: return
        }
        stream?.send(
            SessionStreamClientMessage.Cancel(
                agentId = agentId,
                sessionId = sessionId,
            ),
        )
    }

    override fun replyPermission(requestId: String, optionId: String) {
        synchronized(lock) {
            _snapshot.update { current ->
                current.copy(
                    transcript = applyPermissionResolved(current.transcript),
                    pendingPermission = null,
                )
            }
        }
        stream?.send(
            SessionStreamClientMessage.PermissionReply(
                requestId = requestId,
                optionId = optionId,
            ),
        )
    }

    override fun replyExtension(requestId: String, result: JsonElement) {
        synchronized(lock) {
            _snapshot.update { current ->
                current.copy(extension = null)
            }
        }
        stream?.send(
            SessionStreamClientMessage.ExtensionReply(
                requestId = requestId,
                result = result,
            ),
        )
    }

    override fun forget(agentId: AgentId, sessionId: String) {
        synchronized(lock) {
            commandsCatalog.forget(agentId, sessionId)
            if (watchAgentId == agentId && watchSessionId == sessionId) {
                _snapshot.update { current ->
                    current.copy(availableCommands = emptyList())
                }
            }
        }
    }

    private suspend fun run(serverOrigin: String) {
        var reconnect = false

        while (currentCoroutineContext().isActive) {
            applyConnection(ConnectionSignal.ConnectRequested)

            if (reconnect) {
                subscribedKey = null
                synchronized(lock) {
                    replaceInboxLocked()
                    pendingPrompt = null
                    _snapshot.value = emptyLiveSnapshotLocked(reconnecting = true)
                }
            }

            val closed = CompletableDeferred<DisconnectCause>()
            val active = streamFactory.open(
                serverOrigin = serverOrigin,
                handlers = SessionStreamHandlers(
                    onMessage = ::enqueueFrame,
                    onOpen = { applyConnection(ConnectionSignal.Connected) },
                    onDisconnect = { cause ->
                        if (!closed.isCompleted) {
                            closed.complete(cause)
                        }
                    },
                ),
            )
            stream = active
            sendSubscribeForTarget()

            val cause = closed.await()
            active.close()
            stream = null
            applyConnection(ConnectionSignal.Disconnected(cause))

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
                        stream?.send(
                            SessionStreamClientMessage.Prompt(
                                agentId = message.agentId,
                                sessionId = message.sessionId,
                                text = queued,
                            ),
                        )
                    }
                }
                is SessionStreamServerMessage.PromptComplete -> {
                    if (!belongsToWatchLocked(message.agentId, message.sessionId)) {
                        return
                    }
                    _snapshot.update { current ->
                        current.copy(transcript = applyPromptComplete(current.transcript))
                    }
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
            }
        }
    }

    private fun sendSubscribeForTarget() {
        val agentId: AgentId
        val sessionId: String
        val active: SessionStream
        val nextKey: String
        val useSwitch: Boolean
        synchronized(lock) {
            agentId = watchAgentId ?: return
            sessionId = watchSessionId ?: return
            active = stream ?: return
            nextKey = catalogSessionKey(agentId, sessionId)
            if (subscribedKey == nextKey) {
                return
            }
            useSwitch = subscribedKey != null
            subscribedKey = nextKey
        }
        val message = if (useSwitch) {
            SessionStreamClientMessage.Switch(agentId = agentId, sessionId = sessionId)
        } else {
            SessionStreamClientMessage.Subscribe(agentId = agentId, sessionId = sessionId)
        }
        active.send(message)
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
        subscribedKey = null
        if (clearCatalog) {
            commandsCatalog.clear()
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
        )
    }

    private fun belongsToWatchLocked(agentId: AgentId, sessionId: String): Boolean =
        watchAgentId == agentId && watchSessionId == sessionId

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
