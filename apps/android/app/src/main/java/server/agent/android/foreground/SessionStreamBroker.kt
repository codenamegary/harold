package server.agent.android.foreground

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import server.agent.android.chat.SessionChatStream
import server.agent.android.chat.SessionEventSource
import server.agent.android.contracts.EventEnvelope
import server.agent.android.events.EventStreamFactory

enum class StreamPinReason {
    Ui,
    Service,
}

data class SessionStreamFrame(
    val sessionId: String,
    val events: List<EventEnvelope>,
    val reconnect: Boolean = false,
)

/**
 * Application-scoped owner for session event streams. UI and the foreground service
 * pin independently so idle selected chats keep a stream after the service stops.
 */
interface SessionStreamBroker {
    val frames: SharedFlow<SessionStreamFrame>

    fun pin(serverOrigin: String, sessionId: String, reason: StreamPinReason)

    fun unpin(sessionId: String, reason: StreamPinReason)

    fun unpinAll(reason: StreamPinReason)

    fun pinnedSessionIds(): Set<String>

    fun sessionIdsPinnedFor(reason: StreamPinReason): Set<String>
}

class DefaultSessionStreamBroker(
    private val streamFactory: EventStreamFactory,
    private val scope: CoroutineScope,
    private val eventSourceFactory: (CoroutineScope) -> SessionEventSource = { hostScope ->
        SessionChatStream(streamFactory = streamFactory, scope = hostScope)
    },
) : SessionStreamBroker {
    private val _frames = MutableSharedFlow<SessionStreamFrame>(extraBufferCapacity = 64)
    override val frames: SharedFlow<SessionStreamFrame> = _frames.asSharedFlow()

    private val jobs = mutableMapOf<String, Job>()
    private val origins = mutableMapOf<String, String>()
    private val reasons = mutableMapOf<String, MutableSet<StreamPinReason>>()

    override fun pin(serverOrigin: String, sessionId: String, reason: StreamPinReason) {
        val reasonSet = reasons.getOrPut(sessionId) { mutableSetOf() }
        reasonSet.add(reason)

        val existing = jobs[sessionId]
        if (existing?.isActive == true && origins[sessionId] == serverOrigin) {
            return
        }

        existing?.cancel()
        origins[sessionId] = serverOrigin

        val source = eventSourceFactory(scope)
        jobs[sessionId] = source.observe(
            serverOrigin = serverOrigin,
            sessionId = sessionId,
            onReconnect = {
                scope.launch {
                    _frames.emit(
                        SessionStreamFrame(
                            sessionId = sessionId,
                            events = emptyList(),
                            reconnect = true,
                        ),
                    )
                }
            },
            onEvents = { events ->
                scope.launch {
                    _frames.emit(
                        SessionStreamFrame(
                            sessionId = sessionId,
                            events = events,
                            reconnect = false,
                        ),
                    )
                }
            },
        )
    }

    override fun unpin(sessionId: String, reason: StreamPinReason) {
        val reasonSet = reasons[sessionId] ?: return
        reasonSet.remove(reason)
        if (reasonSet.isNotEmpty()) {
            return
        }

        reasons.remove(sessionId)
        jobs.remove(sessionId)?.cancel()
        origins.remove(sessionId)
    }

    override fun unpinAll(reason: StreamPinReason) {
        reasons.keys.toList().forEach { sessionId ->
            unpin(sessionId, reason)
        }
    }

    override fun pinnedSessionIds(): Set<String> = reasons.keys.toSet()

    override fun sessionIdsPinnedFor(reason: StreamPinReason): Set<String> =
        reasons.filterValues { set -> reason in set }.keys.toSet()
}
