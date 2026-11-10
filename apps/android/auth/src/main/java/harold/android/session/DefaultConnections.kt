package harold.android.session

import harold.android.contracts.SessionState
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.stream.ReconnectPolicy
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine

class DefaultConnections(
    private val savedConnections: ConnectionRepository,
    private val reachability: ConnectionReachability,
    private val scope: CoroutineScope,
) : Connections {
    @Inject constructor(
        savedConnections: ConnectionRepository,
        reachability: ConnectionReachability,
    ) : this(
        savedConnections = savedConnections,
        reachability = reachability,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    private val lock = Any()
    private val _connections = MutableStateFlow<List<ConnectionHealth>>(emptyList())
    override val connections: StateFlow<List<ConnectionHealth>> = _connections.asStateFlow()

    private var foreground: Boolean = false
    private var saved: List<SavedConnection> = emptyList()
    private val sessionStates = mutableMapOf<String, List<SessionState>>()
    private val statuses = linkedMapOf<String, ConnectionStatus>()
    private val jobs = linkedMapOf<String, Job>()

    override fun onForeground() {
        foreground = true
        reconcile()
    }

    override fun onBackground() {
        foreground = false
        reconcile()
    }

    override suspend fun refresh() {
        val next = savedConnections.list()
        synchronized(lock) {
            saved = next
        }
        reconcile()
    }

    override fun setSessionStates(connectionId: String, states: List<SessionState>) {
        synchronized(lock) {
            sessionStates[connectionId] = states
        }
        reconcile()
    }

    override fun shouldStayConnected(connectionId: String): Boolean = synchronized(lock) {
        saved.any { connection -> connection.connectionId == connectionId } && shouldHoldLocked(connectionId)
    }

    private fun reconcile() {
        val openOrigins: List<String>
        val closeOrigins: List<String>
        synchronized(lock) {
            val known = saved.map { connection -> connection.connectionId }
            sessionStates.keys.retainAll(known.toSet())
            closeOrigins = known.filter { origin -> !shouldHoldLocked(origin) } +
                jobs.keys.filter { origin -> origin !in known }
            openOrigins = known.filter { origin -> shouldHoldLocked(origin) && jobs[origin]?.isActive != true }
        }
        closeOrigins.distinct().forEach(::close)
        openOrigins.distinct().forEach(::open)
        publish()
    }

    private fun shouldHoldLocked(connectionId: String): Boolean {
        if (foreground) {
            return true
        }
        return sessionStates[connectionId].orEmpty().any(::isLiveSession)
    }

    private fun open(connectionId: String) {
        lateinit var link: Job
        link = scope.launch(start = CoroutineStart.LAZY) {
            try {
                var attempt = 0
                while (coroutineContext.isActive) {
                    setStatus(connectionId, ConnectionStatus.Connecting, link)
                    val result = try {
                        reachability.check(connectionId)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Throwable) {
                        Result.failure(error)
                    }
                    if (!coroutineContext.isActive) {
                        return@launch
                    }
                    if (result.isSuccess) {
                        setStatus(connectionId, ConnectionStatus.Connected, link)
                        suspendCancellableCoroutine<Unit> { }
                    } else {
                        setStatus(connectionId, ConnectionStatus.Unreachable, link)
                        attempt += 1
                        delay(ReconnectPolicy.delayMillis(attempt))
                    }
                }
            } finally {
                synchronized(lock) {
                    if (jobs[connectionId] === link) {
                        jobs.remove(connectionId)
                        statuses[connectionId] = ConnectionStatus.Closed
                    }
                }
                publish()
            }
        }
        val previous = synchronized(lock) {
            val existing = jobs[connectionId]
            jobs[connectionId] = link
            statuses[connectionId] = ConnectionStatus.Connecting
            existing
        }
        previous?.cancel()
        link.start()
    }

    private fun close(connectionId: String) {
        val job = synchronized(lock) {
            statuses[connectionId] = ConnectionStatus.Closed
            jobs.remove(connectionId)
        }
        job?.cancel()
    }

    private fun setStatus(connectionId: String, status: ConnectionStatus, job: Job?) {
        synchronized(lock) {
            if (job == null || jobs[connectionId] !== job) {
                return
            }
            statuses[connectionId] = status
        }
        publish()
    }

    private fun publish() {
        val next = synchronized(lock) {
            saved.map { connection ->
                ConnectionHealth(
                    connectionId = connection.connectionId,
                    status = statuses[connection.connectionId] ?: ConnectionStatus.Closed,
                )
            }
        }
        _connections.value = next
    }
}

private fun isLiveSession(state: SessionState): Boolean =
    when (state) {
        SessionState.Starting,
        SessionState.Running,
        SessionState.AwaitingPermission,
        SessionState.AwaitingAnswer,
        SessionState.Stopping,
        -> true
        SessionState.Idle,
        SessionState.Offline,
        SessionState.Error,
        -> false
    }
