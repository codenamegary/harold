package harold.android.session

import harold.android.contracts.SessionState
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.SavedConnection
import harold.android.testing.FakeConnectionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class DefaultSessionGatewayTest {
    @Test
    fun refreshPairedStateReflectsTheFirstSavedConnection() = runTest {
        val store = FakeConnectionStore()
        store.save(saved("ssh://gary@laptop.local:22", "laptop"))
        store.save(saved("ssh://gary@desktop.local:22", "desktop"))
        val gateway = DefaultSessionGateway(credentialStore = store)

        gateway.refresh()

        assertEquals(
            PairedState.Paired(connectionId = "ssh://gary@laptop.local:22", deviceName = "Pixel"),
            gateway.pairedState.value,
        )
    }

    @Test
    fun refreshResolvesThePairedStateBeforeConnectionsOpen() = runTest {
        val store = FakeConnectionStore()
        store.save(saved("ssh://gary@laptop.local:22", "laptop"))
        val pairedAtRefresh = mutableListOf<Boolean>()
        var gateway: SessionGateway? = null
        val connections = object : Connections {
            override val connections = MutableStateFlow(emptyList<ConnectionHealth>())
            override fun onForeground() = Unit
            override fun onBackground() = Unit
            override suspend fun refresh() {
                pairedAtRefresh += gateway?.pairedState?.value is PairedState.Paired
            }
            override fun setSessionStates(
                connectionId: String,
                states: List<SessionState>,
            ) = Unit
            override fun shouldStayConnected(connectionId: String): Boolean = false
        }
        gateway = DefaultSessionGateway(credentialStore = store, connections = connections)

        gateway.refresh()

        assertEquals(listOf(true), pairedAtRefresh)
    }

    @Test
    fun refreshWithoutStoredConnectionsReturnsToNotPaired() = runTest {
        val gateway = DefaultSessionGateway(credentialStore = FakeConnectionStore(null))

        gateway.refresh()

        assertEquals(PairedState.NotPaired, gateway.pairedState.value)
    }

    @Test
    fun clearLocalAccessDeletesStoreAndReturnsToNotPaired() = runTest {
        val store = FakeConnectionStore(saved("ssh://gary@laptop.local:22", "laptop"))
        val gateway = DefaultSessionGateway(credentialStore = store)

        gateway.refresh()
        gateway.clearLocalAccess()

        assertEquals(emptyList<SavedConnection>(), store.list())
        assertEquals(1, store.clearCount)
        assertEquals(PairedState.NotPaired, gateway.pairedState.value)
    }
}

private fun saved(connectionId: String, name: String) = SavedConnection(
    formatVersion = 3,
    connectionId = connectionId,
    deviceName = "Pixel",
    name = name,
    colorId = "ink",
    iconId = "mark",
    ssh = SshConfig(
        host = "laptop.local",
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)
