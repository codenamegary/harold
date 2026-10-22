package harold.android.foreground

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

    fun updateNotification(copy: NotificationCopy)

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
) {
    private val _state = MutableStateFlow(ForegroundCoordinatorState())
    val state: StateFlow<ForegroundCoordinatorState> = _state.asStateFlow()

    private var serverOrigin: String? = null
    private var permissionPromptDismissed: Boolean = false

    fun setServerOrigin(origin: String?) {
        serverOrigin = origin
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

    fun reconcile() {
        val active = tracker.sessions.value
        val desired = active.isNotEmpty()
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

        val presentation = runningNotification(active)

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

        _state.value = ForegroundCoordinatorState(
            serviceDesired = true,
            permissionDenied = false,
            notification = presentation.copy,
            openSessionId = presentation.openSessionId,
            openSessionList = presentation.openSessionList,
            largeIconId = presentation.largeIconId,
        )

        if (!launcher.isRunning) {
            launcher.start()
        }
        launcher.updateNotification(presentation.copy)
    }
}
