package harold.android

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import harold.android.live.SessionOwner
import harold.android.session.Connections
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Keeps a connection to every saved connection while the app is open, and keeps
 * only Harolds with a live session connected while the app is in the background.
 */
@Singleton
class HaroldConnectionHost(
    private val connections: Connections,
    private val connectionGateway: ConnectionGateway,
    private val sessionOwner: SessionOwner,
    private val scope: CoroutineScope,
) : DefaultLifecycleObserver {
    @Inject constructor(
        connections: Connections,
        connectionGateway: ConnectionGateway,
        sessionOwner: SessionOwner,
    ) : this(
        connections = connections,
        connectionGateway = connectionGateway,
        sessionOwner = sessionOwner,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    )

    fun start() {
        val lifecycle = ProcessLifecycleOwner.get().lifecycle
        lifecycle.addObserver(this)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
            onStart(ProcessLifecycleOwner.get())
        }
    }

    override fun onStart(owner: LifecycleOwner) {
        onAppForeground()
    }

    override fun onStop(owner: LifecycleOwner) {
        onAppBackground()
    }

    fun onAppForeground() {
        connections.onForeground()
        scope.launch {
            connectionGateway.refresh()
            val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
            if (active != null && connections.shouldStayConnected(active.connectionId)) {
                sessionOwner.connect(active.connectionId)
                sessionOwner.onForeground()
            } else {
                sessionOwner.closeForBackground()
            }
        }
    }

    fun onAppBackground() {
        connections.onBackground()
        val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
        if (active != null && connections.shouldStayConnected(active.connectionId)) {
            sessionOwner.onBackground()
        } else {
            sessionOwner.closeForBackground()
        }
    }
}
