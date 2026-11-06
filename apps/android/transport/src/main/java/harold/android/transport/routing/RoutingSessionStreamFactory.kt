package harold.android.transport.routing

import harold.android.contracts.AgentId
import harold.android.credentials.HaroldTransport
import harold.android.credentials.SavedHaroldRepository
import harold.android.stream.OkHttpSseSessionStreamFactory
import harold.android.stream.SessionStream
import harold.android.stream.SessionStreamFactory
import harold.android.stream.SessionStreamHandlers
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Chooses the SSE stream or the SSH ACP stream from the saved connection's
 * transport. The caller only knows the roster id.
 */
@Singleton
class RoutingSessionStreamFactory @Inject constructor(
    private val http: OkHttpSseSessionStreamFactory,
    private val ssh: SshSessionStreamFactory,
    private val savedHarolds: SavedHaroldRepository,
) : SessionStreamFactory {
    override fun open(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        lastEventId: String?,
        handlers: SessionStreamHandlers,
    ): SessionStream {
        val proxy = TransportSelectionStream()
        proxy.start {
            val transport = savedHarolds.find(serverOrigin)?.transport
            val stream = if (transport == HaroldTransport.Ssh) {
                ssh.open(serverOrigin, agentId, sessionId, lastEventId, handlers)
            } else {
                http.open(serverOrigin, agentId, sessionId, lastEventId, handlers)
            }
            proxy.attach(stream)
        }
        return proxy
    }
}

private class TransportSelectionStream : SessionStream {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val closed = AtomicBoolean(false)
    private val delegate = AtomicReference<SessionStream?>(null)

    fun start(select: suspend () -> Unit) {
        scope.launch {
            select()
        }
    }

    fun attach(stream: SessionStream) {
        if (closed.get()) {
            stream.close()
            return
        }
        delegate.set(stream)
        if (closed.get()) {
            delegate.getAndSet(null)?.close()
        }
    }

    override fun close() {
        closed.set(true)
        delegate.getAndSet(null)?.close()
        scope.cancel()
    }

    override fun lastFrameAtNanos(): Long? = delegate.get()?.lastFrameAtNanos()
}
