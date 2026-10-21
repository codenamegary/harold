package harold.android

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import harold.android.live.SessionOwner
import harold.android.session.HaroldConnections
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Keeps a connection to every saved Harold while the app is open, and keeps
 * only Harolds with a live session connected while the app is in the background.
 */
@Singleton
class HaroldConnectionHost(
    private val connections: HaroldConnections,
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val scope: CoroutineScope,
) : DefaultLifecycleObserver {
    @Inject constructor(
        connections: HaroldConnections,
        sessionGateway: SessionGateway,
        sessionOwner: SessionOwner,
    ) : this(
        connections = connections,
        sessionGateway = sessionGateway,
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
            sessionGateway.refresh()
            val paired = sessionGateway.pairedState.value as? PairedState.Paired
            if (paired != null && connections.shouldStayConnected(paired.serverOrigin)) {
                sessionOwner.connect(paired.serverOrigin)
                sessionOwner.onForeground()
            } else {
                sessionOwner.closeForBackground()
            }
        }
    }

    fun onAppBackground() {
        connections.onBackground()
        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        if (paired != null && connections.shouldStayConnected(paired.serverOrigin)) {
            sessionOwner.onBackground()
        } else {
            sessionOwner.closeForBackground()
        }
    }
}
