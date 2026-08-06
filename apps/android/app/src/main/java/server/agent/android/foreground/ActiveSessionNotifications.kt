package server.agent.android.foreground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import server.agent.android.MainActivity
import server.agent.android.R

const val ACTIVE_SESSIONS_CHANNEL_ID = "active_sessions"
const val ACTIVE_SESSIONS_NOTIFICATION_ID = 28
const val EXTRA_OPEN_SESSION_ID = "server.agent.android.OPEN_SESSION_ID"

fun ensureActiveSessionsChannel(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
        ACTIVE_SESSIONS_CHANNEL_ID,
        context.getString(R.string.active_sessions_channel_name),
        NotificationManager.IMPORTANCE_LOW,
    ).apply {
        description = context.getString(R.string.active_sessions_channel_description)
        setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
}

fun buildActiveSessionsNotification(
    context: Context,
    copy: NotificationCopy,
    openSessionId: String?,
): Notification {
    ensureActiveSessionsChannel(context)

    val launchIntent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (openSessionId != null) {
            putExtra(EXTRA_OPEN_SESSION_ID, openSessionId)
        }
    }
    val pendingIntent = PendingIntent.getActivity(
        context,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(context, ACTIVE_SESSIONS_CHANNEL_ID)
        .setContentTitle(copy.title)
        .setContentText(copy.text)
        .setSmallIcon(R.drawable.ic_notification)
        .setContentIntent(pendingIntent)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .build()
}

class AndroidNotificationPermissionChecker(
    private val context: Context,
) : NotificationPermissionChecker {
    override fun hasPostNotificationsPermission(): Boolean {
        if (Build.VERSION.SDK_INT < 33) {
            return true
        }

        return ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }
}

class AndroidSessionForegroundLauncher(
    private val context: Context,
) : SessionForegroundLauncher {
    @Volatile
    override var isRunning: Boolean = false
        private set

    override fun start() {
        val intent = Intent(context, ActiveSessionsService::class.java).apply {
            action = ActiveSessionsService.ACTION_START
        }
        ContextCompat.startForegroundService(context, intent)
        isRunning = true
    }

    override fun stop() {
        val intent = Intent(context, ActiveSessionsService::class.java).apply {
            action = ActiveSessionsService.ACTION_STOP
        }
        context.startService(intent)
        isRunning = false
    }

    override fun updateNotification(copy: NotificationCopy) {
        val intent = Intent(context, ActiveSessionsService::class.java).apply {
            action = ActiveSessionsService.ACTION_UPDATE
            putExtra(ActiveSessionsService.EXTRA_TITLE, copy.title)
            putExtra(ActiveSessionsService.EXTRA_TEXT, copy.text)
        }
        context.startService(intent)
    }
}

fun foregroundServiceType(): Int =
    if (Build.VERSION.SDK_INT >= 34) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
    } else {
        0
    }
