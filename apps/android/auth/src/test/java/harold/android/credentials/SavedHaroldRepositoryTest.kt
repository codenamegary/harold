package harold.android.credentials

import harold.android.session.PairedState
import harold.android.testing.FakeCredentialStore
import harold.android.testing.FakeSessionGateway
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SavedHaroldRepositoryTest {
    @Test
    fun editChangesTheNameColorAndIconAndLeavesTheCredential() = runTest {
        val laptop = harold("http://laptop.local:3847", "devcred_laptop", "laptop", "tide", "bolt")
        val desktop = harold("http://desktop.local:3847", "devcred_desktop", "desktop", "ink", "mark")
        val store = FakeCredentialStore()
        store.save(laptop)
        store.save(desktop)
        val repository = SavedHaroldRepository(store) { _, _ -> Result.success(Unit) }

        repository.edit(
            serverOrigin = laptop.serverOrigin,
            name = "work",
            colorId = "ink",
            iconId = "home",
        )

        val saved = store.list()
        val edited = saved.single { item -> item.serverOrigin == laptop.serverOrigin }
        assertEquals("devcred_laptop", edited.credential)
        assertEquals("work", edited.name)
        assertEquals("ink", edited.colorId)
        assertEquals("home", edited.iconId)
        assertEquals(desktop, saved.single { item -> item.serverOrigin == desktop.serverOrigin })
    }

    @Test
    fun forgetStillRemovesTheHaroldWhenRevokeFails() = runTest {
        val laptop = harold("http://laptop.local:3847", "devcred_laptop", "laptop", "tide", "bolt")
        val desktop = harold("http://desktop.local:3847", "devcred_desktop", "desktop", "ink", "mark")
        val store = FakeCredentialStore()
        store.save(laptop)
        store.save(desktop)
        var revoked = 0
        val repository = SavedHaroldRepository(store) { origin, deviceId ->
            revoked += 1
            assertEquals(laptop.serverOrigin, origin)
            assertEquals(laptop.deviceId, deviceId)
            Result.failure(IllegalStateException("offline"))
        }

        val remains = repository.forget(laptop.serverOrigin, laptop.deviceId)

        assertEquals(1, revoked)
        assertTrue(remains)
        assertEquals(listOf(desktop), store.list())
    }

    @Test
    fun forgettingTheLastHaroldLeavesNone() = runTest {
        val laptop = harold("http://laptop.local:3847", "devcred_laptop", "laptop", "tide", "bolt")
        val store = FakeCredentialStore()
        store.save(laptop)
        val repository = SavedHaroldRepository(store) { _, _ -> Result.success(Unit) }

        val remains = repository.forget(laptop.serverOrigin, laptop.deviceId)

        assertFalse(remains)
        assertEquals(emptyList<StoredCredential>(), store.list())
    }

    @Test
    fun forgettingTheActiveHaroldConnectsTheOneThatRemains() = runTest {
        val gateway = FakeSessionGateway(PairedState.Paired("http://laptop.local:3847", "device_laptop", "Pixel"))
        gateway.pairedAfterRefresh = PairedState.Paired("http://desktop.local:3847", "device_desktop", "Pixel")
        val connections = mutableListOf<String>()
        var disconnected = false
        var showedPairing = false

        settleAfterForget(
            removedOrigin = "http://laptop.local:3847",
            remains = true,
            gateway = gateway,
            disconnect = { disconnected = true },
            connect = { origin -> connections += origin },
            showPairing = { showedPairing = true },
        )

        assertTrue(disconnected)
        assertFalse(showedPairing)
        assertEquals(listOf("http://desktop.local:3847"), connections)
        assertEquals(0, gateway.clearLocalAccessCount)
    }

    @Test
    fun forgettingTheLastHaroldShowsPairing() = runTest {
        val gateway = FakeSessionGateway(PairedState.Paired("http://laptop.local:3847", "device_laptop", "Pixel"))
        var disconnected = false
        var showedPairing = false

        settleAfterForget(
            removedOrigin = "http://laptop.local:3847",
            remains = false,
            gateway = gateway,
            disconnect = { disconnected = true },
            connect = { _ -> error("should not connect") },
            showPairing = { showedPairing = true },
        )

        assertTrue(disconnected)
        assertTrue(showedPairing)
        assertEquals(PairedState.NotPaired, gateway.pairedState.value)
    }
}

private fun harold(
    serverOrigin: String,
    credential: String,
    name: String,
    colorId: String,
    iconId: String,
) = StoredCredential(
    formatVersion = 1,
    deviceId = "device_$name",
    serverOrigin = serverOrigin,
    deviceName = "Pixel",
    credential = credential,
    name = name,
    colorId = colorId,
    iconId = iconId,
)
