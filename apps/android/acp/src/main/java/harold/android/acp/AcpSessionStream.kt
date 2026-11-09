package harold.android.acp

import harold.android.contracts.AgentId
import harold.android.contracts.SessionStreamServerMessage.Error
import harold.android.contracts.SessionStreamServerMessage.Subscribed
import harold.android.process.AgentAuthRequiredException
import harold.android.stream.DisconnectCause
import harold.android.stream.SessionStatus
import harold.android.stream.SessionStream
import harold.android.stream.SessionStreamFactory
import harold.android.stream.SessionStreamHandlers
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Singleton
class AcpSessionStreamFactory @Inject constructor(
    private val runtime: AgentRuntime,
) : SessionStreamFactory {
    override fun open(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        lastEventId: String?,
        handlers: SessionStreamHandlers,
    ): SessionStream = AcpSessionStream(
        connectionId = connectionId,
        agentId = agentId,
        sessionId = sessionId,
        runtime = runtime,
        handlers = handlers,
    )
}

private class AcpSessionStream(
    private val connectionId: String,
    private val agentId: AgentId,
    private val sessionId: String,
    private val runtime: AgentRuntime,
    private val handlers: SessionStreamHandlers,
) : SessionStream {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val subscription = AtomicReference<AcpSessionSubscription?>(null)
    private val lastFrame = AtomicLong(0L)
    private val closed = AtomicBoolean(false)
    private val opened = AtomicBoolean(false)
    private var job: Job? = null
    private var statusJob: Job? = null

    private val _status = MutableStateFlow(SessionStatus.Starting)
    override val status: StateFlow<SessionStatus> = _status.asStateFlow()

    init {
        job = scope.launch {
            val openedSession = try {
                val session = runtime.openSession(connectionId, agentId, sessionId).getOrThrow()
                if (closed.get()) {
                    return@launch
                }
                statusJob = launch {
                    session.status.collect { next -> _status.value = next }
                }
                val attached = try {
                    session.attach()
                } catch (error: Throwable) {
                    statusJob?.cancel()
                    throw error
                }
                if (closed.get()) {
                    attached.detach()
                    statusJob?.cancel()
                    return@launch
                }
                session to attached
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!closed.get()) {
                    runtime.sessionAttachFailed(connectionId, agentId, sessionId)
                    _status.value = when {
                        error is AgentAuthRequiredException -> SessionStatus.AuthFailed
                        error is AcpClosedException -> SessionStatus.Offline
                        else -> SessionStatus.Error
                    }
                    handlers.onMessage(
                        Error(
                            message = error.message ?: "Could not start the session.",
                            agentId = agentId,
                            sessionId = sessionId,
                        ),
                        null,
                    )
                    handlers.onDisconnect(causeFor(error))
                }
                return@launch
            }

            val (session, attached) = openedSession
            subscription.set(attached)
            lastFrame.set(System.nanoTime())
            val heartbeat = launch {
                while (isActive) {
                    delay(HEARTBEAT_MILLIS)
                    lastFrame.set(System.nanoTime())
                }
            }
            try {
                attached.events.collect { message ->
                    lastFrame.set(System.nanoTime())
                    if (message is Subscribed && opened.compareAndSet(false, true)) {
                        runtime.sessionAttachSucceeded(connectionId, agentId, sessionId)
                        handlers.onOpen()
                    }
                    handlers.onMessage(message, null)
                }
                val reason = attached.closed.await()
                if (!closed.get()) {
                    val sessionStatus = session.status.value
                    _status.value = sessionStatus
                    if (!opened.get()) {
                        runtime.sessionAttachFailed(connectionId, agentId, sessionId)
                    }
                    val cause = if (sessionStatus == SessionStatus.AuthFailed) {
                        DisconnectCause.Unauthorized(reason)
                    } else {
                        causeFor(reason ?: "The agent process closed.")
                    }
                    handlers.onDisconnect(cause)
                }
            } finally {
                heartbeat.cancel()
                statusJob?.cancel()
                attached.detach()
            }
        }
    }

    override fun close() {
        closed.set(true)
        subscription.getAndSet(null)?.detach()
        job?.cancel()
        statusJob?.cancel()
        scope.cancel()
    }

    override fun lastFrameAtNanos(): Long? =
        lastFrame.get().takeIf { value -> value > 0L }

    private fun causeFor(error: Throwable): DisconnectCause = when (error) {
        is AgentAuthRequiredException -> DisconnectCause.Unauthorized(error.message)
        is AcpRemoteException -> DisconnectCause.Protocol(error.message ?: "ACP error")
        else -> {
            val message = error.message ?: "Session failed."
            if (message.contains("does not support") || message.contains("did not return this session")) {
                DisconnectCause.Protocol(message)
            } else {
                DisconnectCause.Retryable(message)
            }
        }
    }

    private fun causeFor(reason: String): DisconnectCause =
        if (reason.contains("does not support") || reason.contains("did not return this session")) {
            DisconnectCause.Protocol(reason)
        } else {
            DisconnectCause.Retryable(reason)
        }

    companion object {
        private const val HEARTBEAT_MILLIS = 10_000L
    }
}
