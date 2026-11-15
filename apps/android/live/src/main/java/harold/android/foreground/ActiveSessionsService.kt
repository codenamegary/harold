package harold.android.foreground

import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.ServiceCompat
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Keeps the process alive while any session is in user-visible active work.
 * Session-stream keep-alive stays on SessionOwner, not this service.
 */
@AndroidEntryPoint
class ActiveSessionsService : Service() {
    @Inject lateinit var coordinator: SessionForegroundCoordinator

    override fun onCreate() {
        super.onCreate()
        running = true
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val state = coordinator.state.value
        val copy = state.notification
            ?: NotificationCopy(title = "Harold", text = "Active sessions")
        val notification = buildActiveSessionsNotification(
            context = this,
            copy = copy,
            openSessionId = state.openSessionId,
            openSessionList = state.openSessionList,
            largeIconRes = haroldNotificationIconRes(state.largeIconId),
        )
        ServiceCompat.startForeground(
            this,
            ACTIVE_SESSIONS_NOTIFICATION_ID,
            notification,
            foregroundServiceType(),
        )
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "harold.android.foreground.START"

        /** Mirrors the real service lifetime so callers never trust a stale flag. */
        @Volatile
        var running: Boolean = false
            private set
    }
}
