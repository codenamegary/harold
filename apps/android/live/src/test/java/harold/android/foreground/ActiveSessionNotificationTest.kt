package harold.android.foreground

import android.app.Application
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
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
    }
}
