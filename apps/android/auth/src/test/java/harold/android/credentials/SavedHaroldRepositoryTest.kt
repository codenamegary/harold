package harold.android.credentials

import harold.android.database.LocalCacheCleaner
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
    fun editChangesTheNameColorAndIconAndLeavesTheConnection() = runTest {
        val laptop = harold("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val desktop = harold("ssh://gary@desktop.local:22", "desktop", "ink", "mark")
        val store = FakeCredentialStore()
        store.save(laptop)
        store.save(desktop)
        val repository = SavedHaroldRepository(store)

        repository.edit(
            serverOrigin = laptop.serverOrigin,
            name = "work",
            colorId = "ink",
            iconId = "home",
        )

        val saved = store.list()
        val edited = saved.single { item -> item.serverOrigin == laptop.serverOrigin }
        assertEquals("work", edited.name)
        assertEquals("ink", edited.colorId)
        assertEquals("home", edited.iconId)
        assertEquals(desktop, saved.single { item -> item.serverOrigin == desktop.serverOrigin })
    }

    @Test
    fun removeDropsOneHaroldAndReportsWhenAnyRemain() = runTest {
        val laptop = harold("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val desktop = harold("ssh://gary@desktop.local:22", "desktop", "ink", "mark")
        val store = FakeCredentialStore()
        store.save(laptop)
        store.save(desktop)
        val repository = SavedHaroldRepository(store)

        val remains = repository.remove(laptop.serverOrigin)

        assertTrue(remains)
        assertEquals(listOf(desktop), store.list())
    }

    @Test
    fun removingTheLastHaroldLeavesNone() = runTest {
        val laptop = harold("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val store = FakeCredentialStore()
        store.save(laptop)
        val repository = SavedHaroldRepository(store)

        val remains = repository.remove(laptop.serverOrigin)

        assertFalse(remains)
        assertEquals(emptyList<StoredCredential>(), store.list())
    }

    @Test
    fun removeClearsCachedDataForThatHaroldOnly() = runTest {
        val laptop = harold("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val desktop = harold("ssh://gary@desktop.local:22", "desktop", "ink", "mark")
        val store = FakeCredentialStore()
        store.save(laptop)
        store.save(desktop)
        val cleaned = mutableListOf<String>()
        val repository = SavedHaroldRepository(
            store = store,
            localCacheCleaner = LocalCacheCleaner { serverOrigin -> cleaned += serverOrigin },
        )

        repository.remove(laptop.serverOrigin)

        assertEquals(listOf(laptop.serverOrigin), cleaned)
    }

    @Test
    fun forgetRemovesTheSavedConnection() = runTest {
        val laptop = harold("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val desktop = harold("ssh://gary@desktop.local:22", "desktop", "ink", "mark")
        val store = FakeCredentialStore()
        store.save(laptop)
        store.save(desktop)
        val repository = SavedHaroldRepository(store)

        val remains = forgetSavedHarold(
            serverOrigin = laptop.serverOrigin,
            repository = repository,
        )

        assertTrue(remains)
        assertEquals(listOf(desktop), store.list())
    }

    @Test
    fun forgettingTheActiveHaroldConnectsTheOneThatRemains() = runTest {
        val gateway = FakeSessionGateway(PairedState.Paired("ssh://gary@laptop.local:22", "Pixel"))
        gateway.pairedAfterRefresh = PairedState.Paired("ssh://gary@desktop.local:22", "Pixel")
        val connections = mutableListOf<String>()
        var disconnected = false
        var showedPairing = false

        settleAfterForget(
            removedOrigin = "ssh://gary@laptop.local:22",
            remains = true,
            gateway = gateway,
            disconnect = { disconnected = true },
            connect = { origin -> connections += origin },
            showPairing = { showedPairing = true },
        )

        assertTrue(disconnected)
        assertFalse(showedPairing)
        assertEquals(listOf("ssh://gary@desktop.local:22"), connections)
        assertEquals(0, gateway.clearLocalAccessCount)
    }

    @Test
    fun forgettingTheLastHaroldShowsPairing() = runTest {
        val gateway = FakeSessionGateway(PairedState.Paired("ssh://gary@laptop.local:22", "Pixel"))
        var disconnected = false
        var showedPairing = false

        settleAfterForget(
            removedOrigin = "ssh://gary@laptop.local:22",
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
    name: String,
    colorId: String,
    iconId: String,
) = StoredCredential(
    formatVersion = 3,
    serverOrigin = serverOrigin,
    deviceName = "Pixel",
    name = name,
    colorId = colorId,
    iconId = iconId,
    ssh = SshConfig(
        host = serverOrigin,
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)
