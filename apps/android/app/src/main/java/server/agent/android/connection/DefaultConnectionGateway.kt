package server.agent.android.connection

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage
import server.agent.android.contracts.catalogSessionKey
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
 * Owns one session-stream socket for the process while paired. Chat routes
 * subscribe/switch/prompt through [send] / [setTarget] on this same connection.
 */
class DefaultConnectionGateway(
    private val streamFactory: SessionStreamFactory,
    private val scope: CoroutineScope,
) : ConnectionGateway {
    private val _state = MutableStateFlow(ConnectionState())
    override val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<SessionStreamServerMessage>(extraBufferCapacity = 64)
    override val messages: SharedFlow<SessionStreamServerMessage> = _messages.asSharedFlow()

    private val _streamResets = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    override val streamResets: SharedFlow<Unit> = _streamResets.asSharedFlow()

    private var loop: Job? = null
    private var serverOrigin: String? = null
    private var stream: SessionStream? = null
    private var targetAgentId: AgentId? = null
    private var targetSessionId: String? = null
    private var subscribedKey: String? = null

    override fun connect(serverOrigin: String) {
        val movedServer = this.serverOrigin?.let { it != serverOrigin } ?: false

        this.serverOrigin = serverOrigin
        loop?.cancel()
        stream?.close()
        stream = null
        subscribedKey = null

        if (movedServer) {
            _state.value = ConnectionState()
            targetAgentId = null
            targetSessionId = null
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
        subscribedKey = null
        targetAgentId = null
        targetSessionId = null
        _state.update { current -> current.copy(status = ConnectionStatus.Idle) }
    }

    override fun send(message: SessionStreamClientMessage) {
        stream?.send(message)
    }

    override fun setTarget(agentId: AgentId?, sessionId: String?) {
        targetAgentId = agentId
        targetSessionId = sessionId
        sendSubscribeForTarget()
    }

    private suspend fun run(serverOrigin: String) {
        var reconnect = false

        while (currentCoroutineContext().isActive) {
            apply(ConnectionSignal.ConnectRequested)

            if (reconnect) {
                subscribedKey = null
                _streamResets.tryEmit(Unit)
            }

            val closed = CompletableDeferred<DisconnectCause>()
            val active = streamFactory.open(
                serverOrigin = serverOrigin,
                handlers = SessionStreamHandlers(
                    onMessage = { message -> _messages.tryEmit(message) },
                    onOpen = { apply(ConnectionSignal.Connected) },
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
            apply(ConnectionSignal.Disconnected(cause))

            val status = _state.value.status
            if (status !is ConnectionStatus.Reconnecting) {
                return
            }

            delay(ReconnectPolicy.delayMillis(status.attempt))
            reconnect = true
        }
    }

    private fun sendSubscribeForTarget() {
        val agentId = targetAgentId
        val sessionId = targetSessionId
        val active = stream
        if (agentId == null || sessionId.isNullOrEmpty() || active === null) {
            return
        }

        val nextKey = catalogSessionKey(agentId, sessionId)
        if (subscribedKey == nextKey) {
            return
        }

        val message = if (subscribedKey === null) {
            SessionStreamClientMessage.Subscribe(agentId = agentId, sessionId = sessionId)
        } else {
            SessionStreamClientMessage.Switch(agentId = agentId, sessionId = sessionId)
        }
        active.send(message)
        subscribedKey = nextKey
    }

    private fun apply(signal: ConnectionSignal) {
        _state.update { current -> reduce(current, signal) }
    }
}
