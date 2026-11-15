package harold.android

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import harold.android.acp.AgentRuntime
import harold.android.live.SessionOwner
import harold.android.session.Connections
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import harold.android.stream.SessionStatus
import harold.android.transport.ssh.SshConnectionPool
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
    private val connectionPool: SshConnectionPool,
    private val agentRuntime: AgentRuntime,
    private val scope: CoroutineScope,
) : DefaultLifecycleObserver {
    @Inject constructor(
        connections: Connections,
        connectionGateway: ConnectionGateway,
        sessionOwner: SessionOwner,
        connectionPool: SshConnectionPool,
        agentRuntime: AgentRuntime,
    ) : this(
        connections = connections,
        connectionGateway = connectionGateway,
        sessionOwner = sessionOwner,
        connectionPool = connectionPool,
        agentRuntime = agentRuntime,
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
        agentRuntime.trimIdle()
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
        val activeHeld = active != null && connections.shouldStayConnected(active.connectionId)
        val anyConnectionHeld = connections.connections.value.any { link ->
            connections.shouldStayConnected(link.connectionId)
        }
        // The watched session is the one the user is looking at. Its live
        // status is the strongest signal, even if the connection roster has
        // not caught up with the latest frame.
        val staysConnected = activeHeld ||
            anyConnectionHeld ||
            sessionOwner.sessionStatus.value.hasLiveWork()
        if (staysConnected) {
            sessionOwner.onBackground()
        } else {
            sessionOwner.closeForBackground()
        }
        // Close idle ACP processes before the SSH entries they ride on. The
        // runtime leaves any process with an attached stream alone.
        agentRuntime.onBackground()
        if (!staysConnected) {
            connectionPool.closeAll()
        }
    }
}

private fun SessionStatus.hasLiveWork(): Boolean = when (this) {
    SessionStatus.Starting,
    SessionStatus.Reloading,
    SessionStatus.Running,
    SessionStatus.AwaitingPermission,
    SessionStatus.AwaitingAnswer,
    -> true
    SessionStatus.Ready,
    SessionStatus.Offline,
    SessionStatus.AuthFailed,
    SessionStatus.Error,
    SessionStatus.Gone,
    -> false
}
