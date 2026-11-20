package harold.android.foreground

import harold.android.network.DevServerTunnelApi
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

fun interface NotificationPermissionChecker {
    fun hasPostNotificationsPermission(): Boolean
}

interface SessionForegroundLauncher {
    fun start()

    fun stop()

    fun updateNotification(presentation: RunningNotification)

    val isRunning: Boolean
}

data class ForegroundCoordinatorState(
    val serviceDesired: Boolean = false,
    val permissionDenied: Boolean = false,
    val notification: NotificationCopy? = null,
    val openSessionId: String? = null,
    val openSessionList: Boolean = false,
    val largeIconId: String? = null,
)

/**
 * Starts the foreground service only when active sessions exist and notification
 * permission is granted. Otherwise surfaces permission-denied UX.
 * Keep-alive chat traffic stays on [harold.android.live.SessionOwner].
 */
@Singleton
class SessionForegroundCoordinator @Inject constructor(
    private val tracker: ActiveSessionTracker,
    private val permissionChecker: NotificationPermissionChecker,
    private val launcher: SessionForegroundLauncher,
    private val devServerTunnels: DevServerTunnelApi? = null,
) {
    private val _state = MutableStateFlow(ForegroundCoordinatorState())
    val state: StateFlow<ForegroundCoordinatorState> = _state.asStateFlow()

    private var connectionId: String? = null
    private var permissionPromptDismissed: Boolean = false

    fun setConnectionId(origin: String?) {
        connectionId = origin
        if (origin == null) {
            tracker.replaceAll(emptyList())
            permissionPromptDismissed = false
        }
        reconcile()
    }

    fun onSessionsChanged() {
        reconcile()
    }

    fun onPermissionMaybeChanged() {
        if (permissionChecker.hasPostNotificationsPermission()) {
            permissionPromptDismissed = false
        }
        reconcile()
    }

    fun dismissPermissionPrompt() {
        permissionPromptDismissed = true
        _state.value = _state.value.copy(permissionDenied = false)
    }

    fun onTunnelChanged() {
        reconcile()
    }

    fun reconcile() {
        val active = tracker.sessions.value
        // A forwarded dev server keeps the process in the foreground so the
        // SSH connection and its local listener survive the browser switch.
        val tunnelsOpen = devServerTunnels?.hasOpenTunnels == true
        val desired = active.isNotEmpty() || tunnelsOpen
        val permitted = permissionChecker.hasPostNotificationsPermission()

        if (!desired) {
            if (launcher.isRunning) {
                launcher.stop()
            }
            _state.value = ForegroundCoordinatorState(
                serviceDesired = false,
                permissionDenied = false,
                notification = null,
                openSessionId = null,
            )
            return
        }

        val presentation = if (active.isEmpty()) {
            RunningNotification(
                copy = NotificationCopy(
                    title = "Dev server link open",
                    text = "Harold is forwarding a host port over SSH",
                ),
                largeIconId = null,
                openSessionId = null,
                openSessionList = false,
            )
        } else {
            runningNotification(active)
        }

        if (!permitted) {
            if (launcher.isRunning) {
                launcher.stop()
            }
            _state.value = ForegroundCoordinatorState(
                serviceDesired = true,
                permissionDenied = !permissionPromptDismissed,
                notification = null,
                openSessionId = presentation.openSessionId,
                openSessionList = presentation.openSessionList,
                largeIconId = presentation.largeIconId,
            )
            return
        }

        val next = ForegroundCoordinatorState(
            serviceDesired = true,
            permissionDenied = false,
            notification = presentation.copy,
            openSessionId = presentation.openSessionId,
            openSessionList = presentation.openSessionList,
            largeIconId = presentation.largeIconId,
        )
        val changed = next != _state.value
        val wasRunning = launcher.isRunning
        _state.value = next

        if (!wasRunning) {
            launcher.start()
        }
        if (changed || !wasRunning) {
            launcher.updateNotification(presentation)
        }
    }
}
