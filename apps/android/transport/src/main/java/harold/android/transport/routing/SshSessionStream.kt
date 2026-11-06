package harold.android.transport.routing

import harold.android.contracts.AgentId
import harold.android.contracts.SessionStreamServerMessage.Error
import harold.android.stream.DisconnectCause
import harold.android.stream.SessionStream
import harold.android.stream.SessionStreamFactory
import harold.android.stream.SessionStreamHandlers
import harold.android.transport.acp.AcpRemoteException
import harold.android.transport.direct.SshAcpSession
import harold.android.transport.direct.SshAcpSessionFactory
import harold.android.transport.ssh.SshException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Singleton
class SshSessionStreamFactory @Inject constructor(
    private val sessions: SshAcpSessionFactory,
) : SessionStreamFactory {
    override fun open(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        lastEventId: String?,
        handlers: SessionStreamHandlers,
    ): SessionStream = SshSessionStream(
        serverOrigin = serverOrigin,
        agentId = agentId,
        sessionId = sessionId,
        sessions = sessions,
        handlers = handlers,
    )
}

private class SshSessionStream(
    private val serverOrigin: String,
    private val agentId: AgentId,
    private val sessionId: String,
    private val sessions: SshAcpSessionFactory,
    private val handlers: SessionStreamHandlers,
) : SessionStream {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val session = AtomicReference<SshAcpSession?>(null)
    private val lastFrame = AtomicLong(0L)
    private val closed = AtomicBoolean(false)
    private var job: Job? = null

    init {
        job = scope.launch {
            val opened = sessions.open(serverOrigin, agentId, sessionId, this)
            if (closed.get()) {
                opened.getOrNull()?.close()
                return@launch
            }
            opened.fold(
                onSuccess = { acp ->
                    session.set(acp)
                    lastFrame.set(System.nanoTime())
                    handlers.onOpen()
                    val heartbeat = launch {
                        while (isActive) {
                            delay(HEARTBEAT_MILLIS)
                            lastFrame.set(System.nanoTime())
                        }
                    }
                    try {
                        acp.events.collect { message ->
                            lastFrame.set(System.nanoTime())
                            handlers.onMessage(message, null)
                        }
                        val reason = acp.closed.await()
                        if (!closed.get()) {
                            handlers.onDisconnect(
                                causeFor(reason ?: "The agent process closed."),
                            )
                        }
                    } finally {
                        heartbeat.cancel()
                        acp.close()
                    }
                },
                onFailure = { error ->
                    if (!closed.get()) {
                        handlers.onMessage(
                            Error(
                                message = error.message ?: "Could not start the direct session.",
                                agentId = agentId,
                                sessionId = sessionId,
                            ),
                            null,
                        )
                        handlers.onDisconnect(causeFor(error))
                    }
                },
            )
        }
    }

    override fun close() {
        closed.set(true)
        session.getAndSet(null)?.close()
        job?.cancel()
        scope.cancel()
    }

    override fun lastFrameAtNanos(): Long? =
        lastFrame.get().takeIf { value -> value > 0L }

    private fun causeFor(error: Throwable): DisconnectCause = when (error) {
        is AcpRemoteException -> DisconnectCause.Protocol(error.message ?: "ACP error")
        is SshException -> DisconnectCause.Retryable(error.message ?: "SSH connection failed")
        else -> {
            val message = error.message ?: "Direct session failed."
            if (message.contains("does not support") || message.contains("metadata")) {
                DisconnectCause.Protocol(message)
            } else {
                DisconnectCause.Retryable(message)
            }
        }
    }

    private fun causeFor(reason: String): DisconnectCause =
        if (reason.contains("does not support") || reason.contains("metadata")) {
            DisconnectCause.Protocol(reason)
        } else {
            DisconnectCause.Retryable(reason)
        }

    companion object {
        private const val HEARTBEAT_MILLIS = 10_000L
    }
}
