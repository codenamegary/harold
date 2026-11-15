package harold.android.foreground

import android.app.Application
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.robolectric.Shadows.shadowOf
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class ActiveSessionNotificationTest {
    @Test
    fun buildsOngoingNotificationWithoutActionsOrPreview() {
        val context = RuntimeEnvironment.getApplication()
        val notification = buildActiveSessionsNotification(
            context = context,
            copy = NotificationCopy(title = "Harold", text = "Build · Running"),
            openSessionId = "sess_01",
        )

        assertEquals("Harold", notification.extras.getString(android.app.Notification.EXTRA_TITLE))
        assertEquals("Build · Running", notification.extras.getString(android.app.Notification.EXTRA_TEXT))
        assertTrue(notification.flags and android.app.Notification.FLAG_ONGOING_EVENT != 0)
        assertNotNull(notification.contentIntent)
        assertEquals(0, notification.actions?.size ?: 0)
        assertEquals(harold.android.live.R.drawable.ic_notification, notification.smallIcon.resId)
    }

    @Test
    fun updatingTheActiveNotificationDoesNotStartTheService() {
        val application = RuntimeEnvironment.getApplication()
        val launcher = AndroidSessionForegroundLauncher(application)

        launcher.updateNotification(
            RunningNotification(
                copy = NotificationCopy(title = "Harold", text = "Build · Running"),
                largeIconId = "bolt",
                openSessionId = "sess_01",
                openSessionList = false,
            ),
        )

        val manager = application.getSystemService(android.app.NotificationManager::class.java)
        assertNotNull(
            manager.activeNotifications.firstOrNull {
                it.id == ACTIVE_SESSIONS_NOTIFICATION_ID
            },
        )
        assertNull(shadowOf(application).nextStartedService)
    }

    @Test
    fun statusBarIconStaysTheAppIconWhenTheLargeIconIsAHarold() {
        val context = RuntimeEnvironment.getApplication()
        val notification = buildActiveSessionsNotification(
            context = context,
            copy = NotificationCopy(title = "Harold", text = "Build · Running"),
            openSessionId = "sess_01",
            largeIconRes = harold.android.live.R.drawable.ic_harold_bolt,
        )

        assertEquals(harold.android.live.R.drawable.ic_notification, notification.smallIcon.resId)
        assertNotNull(notification.getLargeIcon())
    }
}
