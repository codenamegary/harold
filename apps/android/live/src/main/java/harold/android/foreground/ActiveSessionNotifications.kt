package harold.android.foreground

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
import androidx.core.graphics.drawable.toBitmap
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import harold.android.live.R

const val ACTIVE_SESSIONS_CHANNEL_ID = "active_sessions"
const val PERMISSION_ATTENTION_CHANNEL_ID = "permission_attention"
const val ACTIVE_SESSIONS_NOTIFICATION_ID = 28
const val PERMISSION_NOTIFICATION_ID_BASE = 2800
const val EXTRA_OPEN_SESSION_ID = "harold.android.OPEN_SESSION_ID"
const val EXTRA_OPEN_SESSION_LIST = "harold.android.OPEN_SESSION_LIST"

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

fun haroldNotificationIconRes(iconId: String?): Int? = when (iconId) {
    "mark" -> R.drawable.ic_harold_mark
    "bolt" -> R.drawable.ic_harold_bolt
    "home" -> R.drawable.ic_harold_home
    "cloud" -> R.drawable.ic_harold_cloud
    else -> null
}

fun permissionNotificationId(sessionId: String): Int =
    PERMISSION_NOTIFICATION_ID_BASE + (sessionId.hashCode() and 0xffff)

fun buildActiveSessionsNotification(
    context: Context,
    copy: NotificationCopy,
    openSessionId: String?,
    openSessionList: Boolean = false,
    largeIconRes: Int? = null,
): Notification {
    ensureActiveSessionsChannel(context)

    val launchIntent = (
        context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
                setPackage(context.packageName)
            }
    ).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (openSessionList) {
            putExtra(EXTRA_OPEN_SESSION_LIST, true)
        } else if (openSessionId != null) {
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
        .setLargeIcon(largeIcon(context, largeIconRes))
        .setContentIntent(pendingIntent)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .build()
}

fun buildPermissionAttentionNotification(
    context: Context,
    alert: PermissionNotification,
): Notification {
    ensurePermissionChannel(context)
    val launchIntent = (
        context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
                setPackage(context.packageName)
            }
    ).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(EXTRA_OPEN_SESSION_ID, alert.openSessionId)
    }
    val pendingIntent = PendingIntent.getActivity(
        context,
        alert.openSessionId.hashCode(),
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(context, PERMISSION_ATTENTION_CHANNEL_ID)
        .setContentTitle(alert.title)
        .setContentText(alert.text)
        .setSmallIcon(R.drawable.ic_notification)
        .setLargeIcon(largeIcon(context, haroldNotificationIconRes(alert.largeIconId)))
        .setContentIntent(pendingIntent)
        .setAutoCancel(true)
        .setCategory(NotificationCompat.CATEGORY_STATUS)
        .build()
}

private fun largeIcon(context: Context, resId: Int?) =
    resId?.let { id ->
        androidx.core.content.ContextCompat.getDrawable(context, id)?.toBitmap()
    }

private fun ensurePermissionChannel(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
        PERMISSION_ATTENTION_CHANNEL_ID,
        context.getString(R.string.permission_attention_channel_name),
        NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
        description = context.getString(R.string.permission_attention_channel_description)
    }
    manager.createNotificationChannel(channel)
}

class AndroidPermissionAttentionNotifier @Inject constructor(
    @ApplicationContext private val context: Context,
) : PermissionAttentionNotifier {
    override fun show(alert: PermissionNotification) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.notify(
            permissionNotificationId(alert.openSessionId),
            buildPermissionAttentionNotification(context, alert),
        )
    }

    override fun clear(sessionId: String) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.cancel(permissionNotificationId(sessionId))
    }
}

class AndroidNotificationPermissionChecker @Inject constructor(
    @ApplicationContext private val context: Context,
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

class AndroidSessionForegroundLauncher @Inject constructor(
    @ApplicationContext private val context: Context,
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
