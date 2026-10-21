package harold.android.session

import harold.android.contracts.SessionState
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
import harold.android.testing.FakeCredentialStore
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
            HaroldReachability { origin ->
                checks += origin
                Result.success(Unit)
            },
        )

        roster.onForeground()
        roster.refresh()
        runCurrent()

        assertEquals(setOf(LAPTOP, DESKTOP), checks.toSet())
        assertEquals(2, checks.size)
        assertEquals(HaroldConnectionStatus.Connected, status(roster, LAPTOP))
        assertEquals(HaroldConnectionStatus.Connected, status(roster, DESKTOP))
    }

    @Test
    fun keepsTheOtherHaroldConnectedWhenOneCannotBeReached() = runTest {
        val roster = roster(
            HaroldReachability { origin ->
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

        assertEquals(HaroldConnectionStatus.Unreachable, status(roster, LAPTOP))
        assertEquals(HaroldConnectionStatus.Connected, status(roster, DESKTOP))
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
        val roster = roster(origins, HaroldReachability { Result.success(Unit) })

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
            assertEquals(state.name, HaroldConnectionStatus.Connected, status(roster, origin))
            assertEquals(true, roster.shouldStayConnected(origin))
        }
        quiet.forEach { state ->
            val origin = "http://${state.name.lowercase()}.local:3847"
            assertEquals(state.name, HaroldConnectionStatus.Closed, status(roster, origin))
            assertEquals(false, roster.shouldStayConnected(origin))
        }
    }

    @Test
    fun openingTheAppReconnectsHaroldsClosedInTheBackground() = runTest {
        val checks = mutableListOf<String>()
        val roster = roster(
            HaroldReachability { origin ->
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
        assertEquals(HaroldConnectionStatus.Closed, status(roster, LAPTOP))

        roster.onForeground()
        runCurrent()

        assertEquals(setOf(LAPTOP, DESKTOP), checks.toSet())
        assertEquals(HaroldConnectionStatus.Connected, status(roster, LAPTOP))
        assertEquals(HaroldConnectionStatus.Connected, status(roster, DESKTOP))
    }

    private suspend fun TestScope.roster(
        reachability: HaroldReachability,
    ): HaroldConnections = roster(listOf(LAPTOP, DESKTOP), reachability)

    private suspend fun TestScope.roster(
        origins: List<String>,
        reachability: HaroldReachability,
    ): HaroldConnections {
        val store = FakeCredentialStore()
        origins.forEachIndexed { index, origin ->
            store.save(saved(origin, "devcred_$index", "device_$index"))
        }
        return DefaultHaroldConnections(
            savedHarolds = SavedHaroldRepository(store),
            reachability = reachability,
            scope = backgroundScope,
        )
    }
}

private fun status(roster: HaroldConnections, serverOrigin: String): HaroldConnectionStatus =
    roster.connections.value.single { connection -> connection.serverOrigin == serverOrigin }.status

private fun saved(serverOrigin: String, credential: String, deviceId: String) = StoredCredential(
    formatVersion = 1,
    deviceId = deviceId,
    serverOrigin = serverOrigin,
    deviceName = "Pixel",
    credential = credential,
    name = "harold",
    colorId = "ink",
    iconId = "mark",
)

private const val LAPTOP = "http://laptop.local:3847"
private const val DESKTOP = "http://desktop.local:3847"
