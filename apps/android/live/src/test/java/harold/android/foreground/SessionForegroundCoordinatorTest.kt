package harold.android.foreground

import harold.android.contracts.SessionState
import harold.android.network.DevServerTunnel
import harold.android.network.DevServerTunnelApi
import harold.android.network.LoopbackAddress
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionForegroundCoordinatorTest {
    @Test
    fun startsServiceWhenActiveAndPermitted() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
        )

        coordinator.setConnectionId("https://example.test")
        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Running))
        coordinator.onSessionsChanged()
        advanceUntilIdle()

        assertTrue(launcher.isRunning)
        assertEquals("One · Running", coordinator.state.value.notification?.text)
        assertFalse(coordinator.state.value.permissionDenied)
    }

    @Test
    fun doesNotStartServiceWhenPermissionDenied() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { false },
            launcher = launcher,
        )

        coordinator.setConnectionId("https://example.test")
        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Running))
        coordinator.onSessionsChanged()
        advanceUntilIdle()

        assertFalse(launcher.isRunning)
        assertTrue(coordinator.state.value.permissionDenied)
    }

    @Test
    fun stopsServiceWhenNoActiveSessionsRemain() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
        )

        coordinator.setConnectionId("https://example.test")
        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Running))
        coordinator.onSessionsChanged()
        advanceUntilIdle()
        assertTrue(launcher.isRunning)

        tracker.upsert(ActiveSessionSnapshot("s1", "One", SessionState.Idle))
        coordinator.onSessionsChanged()
        advanceUntilIdle()

        assertFalse(launcher.isRunning)
    }

    @Test
    fun repeatedChangesWithTheSamePresentationDoNotRepostTheNotification() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
        )

        coordinator.setConnectionId("https://example.test")
        tracker.replaceAll(listOf(ActiveSessionSnapshot("s1", "One", SessionState.Running)))
        coordinator.onSessionsChanged()
        advanceUntilIdle()
        val updatesAfterFirstFrame = launcher.updates

        repeat(20) { coordinator.onSessionsChanged() }
        advanceUntilIdle()

        assertEquals(updatesAfterFirstFrame, launcher.updates)
        assertTrue(launcher.isRunning)
    }

    @Test
    fun severalActiveSessionsOpenTheSessionList() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
        )

        coordinator.setConnectionId("https://example.test")
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

        assertEquals(null, coordinator.state.value.openSessionId)
        assertEquals(true, coordinator.state.value.openSessionList)
        assertEquals("2 active sessions · Needs permission", coordinator.state.value.notification?.text)
        assertTrue(launcher.isRunning)
    }

    @Test
    fun keepsTheServiceRunningWhileADevServerTunnelIsOpen() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val tunnels = FakeTunnels(open = true)
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
            devServerTunnels = tunnels,
        )

        coordinator.onTunnelChanged()
        advanceUntilIdle()

        assertTrue(launcher.isRunning)
        assertEquals("Dev server link open", coordinator.state.value.notification?.title)

        tunnels.open = false
        coordinator.onTunnelChanged()
        advanceUntilIdle()

        assertFalse(launcher.isRunning)
        assertFalse(coordinator.state.value.serviceDesired)
    }

    @Test
    fun closesTheServiceWhenTheLastTunnelClosesThroughTheApi() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val tunnels = FakeTunnels()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
            devServerTunnels = tunnels,
        )

        val tunnel = tunnels.open("row", LoopbackAddress(host = "localhost", port = 8765))
            .getOrThrow()
        coordinator.onTunnelChanged()
        advanceUntilIdle()
        assertTrue(launcher.isRunning)
        assertEquals("Dev server link open", coordinator.state.value.notification?.title)

        tunnels.close(tunnel)
        coordinator.onTunnelChanged()
        advanceUntilIdle()

        assertFalse(launcher.isRunning)
        assertFalse(coordinator.state.value.serviceDesired)
        assertNull(coordinator.state.value.notification)
    }

    @Test
    fun aTunnelOpenedDuringSessionsKeepsTheSessionNotificationCopy() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val tunnels = FakeTunnels()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
            devServerTunnels = tunnels,
        )

        coordinator.setConnectionId("https://example.test")
        tracker.replaceAll(listOf(ActiveSessionSnapshot("s1", "One", SessionState.Running)))
        coordinator.onSessionsChanged()
        advanceUntilIdle()
        val sessionCopy = coordinator.state.value.notification
        val updatesBeforeTunnel = launcher.updates

        tunnels.open("row", LoopbackAddress(host = "localhost", port = 8765)).getOrThrow()
        coordinator.onTunnelChanged()
        advanceUntilIdle()

        assertTrue(launcher.isRunning)
        assertEquals(sessionCopy, coordinator.state.value.notification)
        assertEquals("One · Running", coordinator.state.value.notification?.text)
        assertEquals(updatesBeforeTunnel, launcher.updates)
    }

    @Test
    fun closingATunnelWhileASessionIsActiveKeepsTheServiceRunning() = runTest {
        val tracker = DefaultActiveSessionTracker()
        val launcher = FakeLauncher()
        val tunnels = FakeTunnels()
        val coordinator = SessionForegroundCoordinator(
            tracker = tracker,
            permissionChecker = { true },
            launcher = launcher,
            devServerTunnels = tunnels,
        )

        coordinator.setConnectionId("https://example.test")
        tracker.replaceAll(listOf(ActiveSessionSnapshot("s1", "One", SessionState.Running)))
        coordinator.onSessionsChanged()
        advanceUntilIdle()
        val tunnel = tunnels.open("row", LoopbackAddress(host = "localhost", port = 8765))
            .getOrThrow()
        coordinator.onTunnelChanged()
        advanceUntilIdle()

        tunnels.close(tunnel)
        coordinator.onTunnelChanged()
        advanceUntilIdle()

        assertTrue(launcher.isRunning)
        assertEquals("One · Running", coordinator.state.value.notification?.text)
    }

    private class FakeLauncher : SessionForegroundLauncher {
        override var isRunning: Boolean = false
            private set
        var lastCopy: NotificationCopy? = null
            private set
        var updates: Int = 0
            private set

        override fun start() {
            isRunning = true
        }

        override fun stop() {
            isRunning = false
        }

        override fun updateNotification(presentation: RunningNotification) {
            lastCopy = presentation.copy
            updates += 1
        }
    }

    private class FakeTunnels(open: Boolean = false) : DevServerTunnelApi {
        var open: Boolean = open

        override val hasOpenTunnels: Boolean
            get() = open

        override suspend fun open(
            connectionId: String,
            address: LoopbackAddress,
        ): Result<DevServerTunnel> {
            open = true
            return Result.success(
                DevServerTunnel(
                    connectionId = connectionId,
                    localUrl = "http://127.0.0.1:${address.port}/",
                    localPort = address.port,
                    address = address,
                ),
            )
        }

        override suspend fun close(tunnel: DevServerTunnel) {
            open = false
        }

        override suspend fun closeConnection(connectionId: String) {
            open = false
        }

        override suspend fun closeAll() {
            open = false
        }
    }
}
