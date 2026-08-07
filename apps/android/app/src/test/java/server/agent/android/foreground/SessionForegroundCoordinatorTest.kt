package server.agent.android.foreground

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.chat.SessionEventSource
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.SessionState
import server.agent.android.events.EventStreamFactory

@OptIn(ExperimentalCoroutinesApi::class)
class SessionForegroundCoordinatorTest {
    @Test
    fun startsServiceAndPinsStreamsWhenActiveAndPermitted() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val broker = recordingBroker()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
            streamBroker = broker,
        )

        coordinator.setServerOrigin("https://example.test")
        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Running))
        coordinator.onSessionsChanged()
        advanceUntilIdle()

        assertTrue(launcher.isRunning)
        assertEquals(setOf("s1"), broker.pinnedSessionIds())
        assertEquals("One · Running", coordinator.state.value.notification?.text)
        assertFalse(coordinator.state.value.permissionDenied)
    }

    @Test
    fun doesNotStartServiceWhenPermissionDenied() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val broker = recordingBroker()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { false },
            launcher = launcher,
            streamBroker = broker,
        )

        coordinator.setServerOrigin("https://example.test")
        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Running))
        coordinator.onSessionsChanged()
        advanceUntilIdle()

        assertFalse(launcher.isRunning)
        assertTrue(coordinator.state.value.permissionDenied)
        assertTrue(broker.pinnedSessionIds().isEmpty())
    }

    @Test
    fun stopsServiceWhenNoActiveSessionsRemain() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val broker = recordingBroker()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
            streamBroker = broker,
        )

        coordinator.setServerOrigin("https://example.test")
        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Running))
        coordinator.onSessionsChanged()
        advanceUntilIdle()
        assertTrue(launcher.isRunning)

        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Idle))
        coordinator.onSessionsChanged()
        advanceUntilIdle()

        assertFalse(launcher.isRunning)
        assertTrue(broker.pinnedSessionIds().isEmpty())
    }

    @Test
    fun openSessionIdPrefersAwaitingPermissionOverRunning() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val broker = recordingBroker()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
            streamBroker = broker,
        )

        coordinator.setServerOrigin("https://example.test")
        tracker.replaceAll(
            listOf(
                ActiveSessionSnapshot("sess_running", "Tea essay", SessionState.Running),
                ActiveSessionSnapshot(
                    "sess_permission",
                    "trigger permission now",
                    SessionState.AwaitingPermission,
                ),
            ),
        )
        coordinator.onSessionsChanged()
        advanceUntilIdle()

        assertEquals("sess_permission", coordinator.state.value.openSessionId)
        assertEquals("2 active sessions · Needs permission", coordinator.state.value.notification?.text)
        assertTrue(launcher.isRunning)
    }

    private fun TestScope.recordingBroker(): DefaultSessionStreamBroker =
        DefaultSessionStreamBroker(
            streamFactory = EventStreamFactory { error("unused") },
            scope = this,
            eventSourceFactory = {
                object : SessionEventSource {
                    override fun observe(
                        serverOrigin: String,
                        sessionId: String,
                        onReconnect: () -> Unit,
                        onEvents: (List<EventEnvelope>) -> Unit,
                    ): Job = launch { }
                }
            },
        )

    private class FakeLauncher : SessionForegroundLauncher {
        override var isRunning: Boolean = false
            private set
        var lastCopy: NotificationCopy? = null
            private set

        override fun start() {
            isRunning = true
        }

        override fun stop() {
            isRunning = false
        }

        override fun updateNotification(copy: NotificationCopy) {
            lastCopy = copy
        }
    }
}
