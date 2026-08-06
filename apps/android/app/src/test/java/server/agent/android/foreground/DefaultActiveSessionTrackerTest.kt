package server.agent.android.foreground

import org.junit.Assert.assertEquals
import org.junit.Test
import server.agent.android.contracts.SessionState

class DefaultActiveSessionTrackerTest {
    @Test
    fun upsertKeepsOnlyUserVisibleActiveSessions() {
        val tracker = DefaultActiveSessionTracker()

        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Running))
        tracker.upsert(ActiveSessionSnapshot("s2", "Two", SessionState.Idle))

        assertEquals(
            listOf(ActiveSessionSnapshot("s1", "One", SessionState.Running)),
            tracker.sessions.value,
        )
    }

    @Test
    fun upsertUpdatesExistingAndDropsWhenNoLongerActive() {
        val tracker = DefaultActiveSessionTracker()

        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Running))
        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.AwaitingPermission))
        assertEquals(SessionState.AwaitingPermission, tracker.sessions.value.single().state)

        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Idle))
        assertEquals(emptyList<ActiveSessionSnapshot>(), tracker.sessions.value)
    }

    @Test
    fun replaceAllFiltersInactive() {
        val tracker = DefaultActiveSessionTracker()

        tracker.replaceAll(
            listOf(
                ActiveSessionSnapshot("s1", "One", SessionState.Running),
                ActiveSessionSnapshot("s2", "Two", SessionState.Idle),
                ActiveSessionSnapshot("s3", "Three", SessionState.Stopping),
            ),
        )

        assertEquals(
            listOf(
                ActiveSessionSnapshot("s1", "One", SessionState.Running),
                ActiveSessionSnapshot("s3", "Three", SessionState.Stopping),
            ),
            tracker.sessions.value,
        )
    }
}
