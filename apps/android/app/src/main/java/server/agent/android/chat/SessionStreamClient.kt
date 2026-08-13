package server.agent.android.chat

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage
import server.agent.android.contracts.catalogSessionKey
import server.agent.android.events.SessionStream
import server.agent.android.events.SessionStreamFactory
import server.agent.android.events.SessionStreamHandlers

private const val SESSION_STREAM_RECONNECT_DELAY_MS = 250L

interface SessionStreamClient {
    fun start(
        serverOrigin: String,
        onReconnect: () -> Unit,
        onMessage: (SessionStreamServerMessage) -> Unit,
    ): Job

    fun send(message: SessionStreamClientMessage)

    fun setTarget(agentId: AgentId?, sessionId: String?)

    fun stop()
}

class DefaultSessionStreamClient(
    private val streamFactory: SessionStreamFactory,
    private val scope: CoroutineScope,
) : SessionStreamClient {
    private var stream: SessionStream? = null
    private var loopJob: Job? = null
    private var targetAgentId: AgentId? = null
    private var targetSessionId: String? = null
    private var subscribedKey: String? = null

    override fun start(
        serverOrigin: String,
        onReconnect: () -> Unit,
        onMessage: (SessionStreamServerMessage) -> Unit,
    ): Job {
        stop()
        loopJob = scope.launch {
            var reconnect = false
            while (isActive) {
                if (reconnect) {
                    subscribedKey = null
                    onReconnect()
                }

                val closed = CompletableDeferred<Unit>()
                val active = streamFactory.open(
                    serverOrigin = serverOrigin,
                    handlers = SessionStreamHandlers(
                        onMessage = onMessage,
                        onClose = { closed.complete(Unit) },
                        onError = { closed.complete(Unit) },
                    ),
                )
                stream = active
                sendSubscribeForTarget()
                closed.await()
                active.close()
                stream = null
                if (!isActive) {
                    return@launch
                }
                reconnect = true
                delay(SESSION_STREAM_RECONNECT_DELAY_MS)
            }
        }
        return loopJob!!
    }

    override fun send(message: SessionStreamClientMessage) {
        stream?.send(message)
    }

    override fun setTarget(agentId: AgentId?, sessionId: String?) {
        targetAgentId = agentId
        targetSessionId = sessionId
        sendSubscribeForTarget()
    }

    override fun stop() {
        loopJob?.cancel()
        loopJob = null
        stream?.close()
        stream = null
        subscribedKey = null
        targetAgentId = null
        targetSessionId = null
    }

    private fun sendSubscribeForTarget() {
        val agentId = targetAgentId
        val sessionId = targetSessionId
        if (agentId == null || sessionId.isNullOrEmpty()) {
            subscribedKey = null
            return
        }

        val nextKey = catalogSessionKey(agentId, sessionId)
        if (subscribedKey == nextKey) {
            return
        }

        val message = if (subscribedKey == null) {
            SessionStreamClientMessage.Subscribe(agentId = agentId, sessionId = sessionId)
        } else {
            SessionStreamClientMessage.Switch(agentId = agentId, sessionId = sessionId)
        }
        subscribedKey = nextKey
        stream?.send(message)
    }
}
