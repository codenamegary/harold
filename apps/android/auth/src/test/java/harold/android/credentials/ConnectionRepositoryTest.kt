package harold.android.credentials

import harold.android.database.LocalCacheCleaner
import harold.android.session.PairedState
import harold.android.testing.FakeConnectionStore
import harold.android.testing.FakeSessionGateway
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SavedHaroldRepositoryTest {
    @Test
    fun editChangesTheNameColorAndIconAndLeavesTheConnection() = runTest {
        val laptop = savedConnection("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val desktop = savedConnection("ssh://gary@desktop.local:22", "desktop", "ink", "mark")
        val store = FakeConnectionStore()
        store.save(laptop)
        store.save(desktop)
        val repository = ConnectionRepository(store)

        repository.edit(
            connectionId = laptop.connectionId,
            name = "work",
            colorId = "ink",
            iconId = "home",
        )

        val saved = store.list()
        val edited = saved.single { item -> item.connectionId == laptop.connectionId }
        assertEquals("work", edited.name)
        assertEquals("ink", edited.colorId)
        assertEquals("home", edited.iconId)
        assertEquals(desktop, saved.single { item -> item.connectionId == desktop.connectionId })
    }

    @Test
    fun removeDropsOneHaroldAndReportsWhenAnyRemain() = runTest {
        val laptop = savedConnection("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val desktop = savedConnection("ssh://gary@desktop.local:22", "desktop", "ink", "mark")
        val store = FakeConnectionStore()
        store.save(laptop)
        store.save(desktop)
        val repository = ConnectionRepository(store)

        val remains = repository.remove(laptop.connectionId)

        assertTrue(remains)
        assertEquals(listOf(desktop), store.list())
    }

    @Test
    fun removingTheLastHaroldLeavesNone() = runTest {
        val laptop = savedConnection("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val store = FakeConnectionStore()
        store.save(laptop)
        val repository = ConnectionRepository(store)

        val remains = repository.remove(laptop.connectionId)

        assertFalse(remains)
        assertEquals(emptyList<SavedConnection>(), store.list())
    }

    @Test
    fun removeClearsCachedDataForThatHaroldOnly() = runTest {
        val laptop = savedConnection("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val desktop = savedConnection("ssh://gary@desktop.local:22", "desktop", "ink", "mark")
        val store = FakeConnectionStore()
        store.save(laptop)
        store.save(desktop)
        val cleaned = mutableListOf<String>()
        val repository = ConnectionRepository(
            store = store,
            localCacheCleaner = LocalCacheCleaner { connectionId -> cleaned += connectionId },
        )

        repository.remove(laptop.connectionId)

        assertEquals(listOf(laptop.connectionId), cleaned)
    }

    @Test
    fun forgetRemovesTheSavedConnection() = runTest {
        val laptop = savedConnection("ssh://gary@laptop.local:22", "laptop", "tide", "bolt")
        val desktop = savedConnection("ssh://gary@desktop.local:22", "desktop", "ink", "mark")
        val store = FakeConnectionStore()
        store.save(laptop)
        store.save(desktop)
        val repository = ConnectionRepository(store)

        val remains = forgetConnection(
            connectionId = laptop.connectionId,
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

private fun savedConnection(
    connectionId: String,
    name: String,
    colorId: String,
    iconId: String,
) = SavedConnection(
    formatVersion = 3,
    connectionId = connectionId,
    deviceName = "Pixel",
    name = name,
    colorId = colorId,
    iconId = iconId,
    ssh = SshConfig(
        host = connectionId,
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)
