package harold.android.session

import harold.android.contracts.SessionState
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.SavedConnection
import harold.android.testing.FakeConnectionStore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HaroldConnectionsTest {
    @Test
    fun connectsEverySavedHaroldWhileTheAppIsOpen() = runTest {
        val checks = mutableListOf<String>()
        val roster = roster(
            ConnectionReachability { origin ->
                checks += origin
                Result.success(Unit)
            },
        )

        roster.onForeground()
        roster.refresh()
        runCurrent()

        assertEquals(setOf(LAPTOP, DESKTOP), checks.toSet())
        assertEquals(2, checks.size)
        assertEquals(ConnectionStatus.Connected, status(roster, LAPTOP))
        assertEquals(ConnectionStatus.Connected, status(roster, DESKTOP))
    }

    @Test
    fun keepsTheOtherHaroldConnectedWhenOneCannotBeReached() = runTest {
        val roster = roster(
            ConnectionReachability { origin ->
                if (origin == LAPTOP) {
                    Result.failure(IllegalStateException("offline"))
                } else {
                    Result.success(Unit)
                }
            },
        )

        roster.onForeground()
        roster.refresh()
        runCurrent()

        assertEquals(ConnectionStatus.Unreachable, status(roster, LAPTOP))
        assertEquals(ConnectionStatus.Connected, status(roster, DESKTOP))
    }

    @Test
    fun backgroundKeepsOnlyHaroldsWithALiveSession() = runTest {
        val live = listOf(
            SessionState.Starting,
            SessionState.Running,
            SessionState.AwaitingPermission,
            SessionState.Stopping,
        )
        val quiet = listOf(
            SessionState.Idle,
            SessionState.Offline,
            SessionState.Error,
        )
        val origins = (live + quiet).map { state -> "http://${state.name.lowercase()}.local:3847" }
        val roster = roster(origins, ConnectionReachability { Result.success(Unit) })

        roster.onForeground()
        roster.refresh()
        runCurrent()
        (live + quiet).forEach { state ->
            roster.setSessionStates("http://${state.name.lowercase()}.local:3847", listOf(state))
        }

        roster.onBackground()
        runCurrent()

        live.forEach { state ->
            val origin = "http://${state.name.lowercase()}.local:3847"
            assertEquals(state.name, ConnectionStatus.Connected, status(roster, origin))
            assertEquals(true, roster.shouldStayConnected(origin))
        }
        quiet.forEach { state ->
            val origin = "http://${state.name.lowercase()}.local:3847"
            assertEquals(state.name, ConnectionStatus.Closed, status(roster, origin))
            assertEquals(false, roster.shouldStayConnected(origin))
        }
    }

    @Test
    fun openingTheAppReconnectsHaroldsClosedInTheBackground() = runTest {
        val checks = mutableListOf<String>()
        val roster = roster(
            ConnectionReachability { origin ->
                checks += origin
                Result.success(Unit)
            },
        )
        roster.onForeground()
        roster.refresh()
        runCurrent()
        checks.clear()
        roster.setSessionStates(LAPTOP, listOf(SessionState.Idle))
        roster.setSessionStates(DESKTOP, listOf(SessionState.Idle))

        roster.onBackground()
        runCurrent()
        assertEquals(ConnectionStatus.Closed, status(roster, LAPTOP))

        roster.onForeground()
        runCurrent()

        assertEquals(setOf(LAPTOP, DESKTOP), checks.toSet())
        assertEquals(ConnectionStatus.Connected, status(roster, LAPTOP))
        assertEquals(ConnectionStatus.Connected, status(roster, DESKTOP))
    }

    private suspend fun TestScope.roster(
        reachability: ConnectionReachability,
    ): Connections = roster(listOf(LAPTOP, DESKTOP), reachability)

    private suspend fun TestScope.roster(
        origins: List<String>,
        reachability: ConnectionReachability,
    ): Connections {
        val store = FakeConnectionStore()
        origins.forEachIndexed { index, origin ->
            store.save(saved(origin, "devcred_$index", "device_$index"))
        }
        return DefaultConnections(
            savedConnections = ConnectionRepository(store),
            reachability = reachability,
            scope = backgroundScope,
        )
    }
}

private fun status(roster: Connections, connectionId: String): ConnectionStatus =
    roster.connections.value.single { connection -> connection.connectionId == connectionId }.status

private fun saved(connectionId: String, credential: String, deviceId: String) = SavedConnection(
    formatVersion = 3,
    connectionId = connectionId,
    deviceName = "Pixel",
    name = "harold",
    colorId = "ink",
    iconId = "mark",
    ssh = SshConfig(
        host = connectionId,
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)

private const val LAPTOP = "http://laptop.local:3847"
private const val DESKTOP = "http://desktop.local:3847"
