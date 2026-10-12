package harold.android.foreground

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.contracts.SessionState

class ActiveSessionPolicyTest {
    @Test
    fun userVisibleActiveCoversLiveWorkStatesOnly() {
        assertTrue(isUserVisibleActive(SessionState.Starting))
        assertTrue(isUserVisibleActive(SessionState.Running))
        assertTrue(isUserVisibleActive(SessionState.AwaitingPermission))
        assertTrue(isUserVisibleActive(SessionState.Stopping))
        assertFalse(isUserVisibleActive(SessionState.Idle))
        assertFalse(isUserVisibleActive(SessionState.Offline))
        assertFalse(isUserVisibleActive(SessionState.Error))
    }

    @Test
    fun singleSessionNotificationUsesNameAndState() {
        val copy = notificationCopy(
            listOf(snapshot("s1", "Build fix", SessionState.Running)),
        )

        assertEquals("Harold", copy.title)
        assertEquals("Build fix · Running", copy.text)
    }

    @Test
    fun multiSessionNotificationUsesCountAndHighestAttentionLabel() {
        val copy = notificationCopy(
            listOf(
                snapshot("s1", "A", SessionState.Running),
                snapshot("s2", "B", SessionState.AwaitingPermission),
                snapshot("s3", "C", SessionState.Idle),
            ),
        )

        assertEquals("2 active sessions · Needs permission", copy.text)
    }

    @Test
    fun highestPriorityPrefersAwaitingPermissionThenRunning() {
        val top = highestPriorityActiveSession(
            listOf(
                snapshot("s1", "A", SessionState.Stopping),
                snapshot("s2", "B", SessionState.Running),
                snapshot("s3", "C", SessionState.Starting),
            ),
        )

        assertEquals("s2", top?.id)

        val withPermission = highestPriorityActiveSession(
            listOf(
                snapshot("s2", "B", SessionState.Running),
                snapshot("s4", "D", SessionState.AwaitingPermission),
            ),
        )

        assertEquals("s4", withPermission?.id)
    }

    @Test
    fun highestPriorityReturnsNullWhenNoneActive() {
        assertNull(
            highestPriorityActiveSession(
                listOf(snapshot("s1", "A", SessionState.Idle)),
            ),
        )
    }

    private fun snapshot(
        id: String,
        name: String,
        state: SessionState,
    ): ActiveSessionSnapshot = ActiveSessionSnapshot(id = id, name = name, state = state)
}
