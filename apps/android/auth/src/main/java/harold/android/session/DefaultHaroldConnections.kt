package harold.android.session

import harold.android.contracts.SessionState
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
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

class DefaultHaroldConnections(
    private val savedHarolds: SavedHaroldRepository,
    private val reachability: HaroldReachability,
    private val scope: CoroutineScope,
) : HaroldConnections {
    @Inject constructor(
        savedHarolds: SavedHaroldRepository,
        reachability: HaroldReachability,
    ) : this(
        savedHarolds = savedHarolds,
        reachability = reachability,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    private val lock = Any()
    private val _connections = MutableStateFlow<List<HaroldConnection>>(emptyList())
    override val connections: StateFlow<List<HaroldConnection>> = _connections.asStateFlow()

    private var foreground: Boolean = false
    private var saved: List<StoredCredential> = emptyList()
    private val sessionStates = mutableMapOf<String, List<SessionState>>()
    private val statuses = linkedMapOf<String, HaroldConnectionStatus>()
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
        val next = savedHarolds.list()
        synchronized(lock) {
            saved = next
        }
        reconcile()
    }

    override fun setSessionStates(serverOrigin: String, states: List<SessionState>) {
        synchronized(lock) {
            sessionStates[serverOrigin] = states
        }
        reconcile()
    }

    override fun shouldStayConnected(serverOrigin: String): Boolean = synchronized(lock) {
        saved.any { harold -> harold.serverOrigin == serverOrigin } && shouldHoldLocked(serverOrigin)
    }

    private fun reconcile() {
        val openOrigins: List<String>
        val closeOrigins: List<String>
        synchronized(lock) {
            val known = saved.map { harold -> harold.serverOrigin }
            sessionStates.keys.retainAll(known.toSet())
            closeOrigins = known.filter { origin -> !shouldHoldLocked(origin) } +
                jobs.keys.filter { origin -> origin !in known }
            openOrigins = known.filter { origin -> shouldHoldLocked(origin) && jobs[origin]?.isActive != true }
        }
        closeOrigins.distinct().forEach(::close)
        openOrigins.distinct().forEach(::open)
        publish()
    }

    private fun shouldHoldLocked(serverOrigin: String): Boolean {
        if (foreground) {
            return true
        }
        return sessionStates[serverOrigin].orEmpty().any(::isLiveSession)
    }

    private fun open(serverOrigin: String) {
        lateinit var link: Job
        link = scope.launch(start = CoroutineStart.LAZY) {
            try {
                var attempt = 0
                while (coroutineContext.isActive) {
                    setStatus(serverOrigin, HaroldConnectionStatus.Connecting, link)
                    val result = try {
                        reachability.check(serverOrigin)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Throwable) {
                        Result.failure(error)
                    }
                    if (!coroutineContext.isActive) {
                        return@launch
                    }
                    if (result.isSuccess) {
                        setStatus(serverOrigin, HaroldConnectionStatus.Connected, link)
                        suspendCancellableCoroutine<Unit> { }
                    } else {
                        setStatus(serverOrigin, HaroldConnectionStatus.Unreachable, link)
                        attempt += 1
                        delay(ReconnectPolicy.delayMillis(attempt))
                    }
                }
            } finally {
                synchronized(lock) {
                    if (jobs[serverOrigin] === link) {
                        jobs.remove(serverOrigin)
                        statuses[serverOrigin] = HaroldConnectionStatus.Closed
                    }
                }
                publish()
            }
        }
        val previous = synchronized(lock) {
            val existing = jobs[serverOrigin]
            jobs[serverOrigin] = link
            statuses[serverOrigin] = HaroldConnectionStatus.Connecting
            existing
        }
        previous?.cancel()
        link.start()
    }

    private fun close(serverOrigin: String) {
        val job = synchronized(lock) {
            statuses[serverOrigin] = HaroldConnectionStatus.Closed
            jobs.remove(serverOrigin)
        }
        job?.cancel()
    }

    private fun setStatus(serverOrigin: String, status: HaroldConnectionStatus, job: Job?) {
        synchronized(lock) {
            if (job == null || jobs[serverOrigin] !== job) {
                return
            }
            statuses[serverOrigin] = status
        }
        publish()
    }

    private fun publish() {
        val next = synchronized(lock) {
            saved.map { harold ->
                HaroldConnection(
                    serverOrigin = harold.serverOrigin,
                    status = statuses[harold.serverOrigin] ?: HaroldConnectionStatus.Closed,
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
