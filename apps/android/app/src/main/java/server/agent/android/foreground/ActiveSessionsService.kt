package server.agent.android.foreground

import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.ServiceCompat
import server.agent.android.AgentServerApplication

/**
 * Keeps the process alive while any session is in user-visible active work.
 * Session-stream keep-alive stays on ConnectionGateway, not this service.
 */
class ActiveSessionsService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        val app = application as AgentServerApplication
        val coordinator = app.appContainer.sessionForegroundCoordinator

        when (action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_UPDATE -> {
                val updateIntent = intent ?: return START_STICKY
                val title = updateIntent.getStringExtra(EXTRA_TITLE) ?: return START_STICKY
                val text = updateIntent.getStringExtra(EXTRA_TEXT) ?: return START_STICKY
                val openSessionId = coordinator.state.value.openSessionId
                val notification = buildActiveSessionsNotification(
                    context = this,
                    copy = NotificationCopy(title = title, text = text),
                    openSessionId = openSessionId,
                )
                val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
                manager.notify(ACTIVE_SESSIONS_NOTIFICATION_ID, notification)
                return START_STICKY
            }
            else -> {
                val copy = coordinator.state.value.notification
                    ?: NotificationCopy(title = "Agent Server", text = "Active sessions")
                val notification = buildActiveSessionsNotification(
                    context = this,
                    copy = copy,
                    openSessionId = coordinator.state.value.openSessionId,
                )
                ServiceCompat.startForeground(
                    this,
                    ACTIVE_SESSIONS_NOTIFICATION_ID,
                    notification,
                    foregroundServiceType(),
                )
                return START_STICKY
            }
        }
    }

    companion object {
        const val ACTION_START = "server.agent.android.foreground.START"
        const val ACTION_STOP = "server.agent.android.foreground.STOP"
        const val ACTION_UPDATE = "server.agent.android.foreground.UPDATE"
        const val EXTRA_TITLE = "title"
        const val EXTRA_TEXT = "text"
    }
}
