package harold.android.session

import harold.android.credentials.CredentialHolder
import harold.android.credentials.CredentialStore
import harold.android.credentials.StoredCredential
import harold.android.testing.FakeCredentialStore
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DefaultSessionGatewayTest {
    @Test
    fun publishesEachSavedHaroldCredentialForRequestsToThatHarold() = runTest {
        val holder = CredentialHolder()
        val store = FakeCredentialStore()
        store.save(saved("http://laptop.local:3847", "devcred_laptop", "device_laptop"))
        store.save(saved("http://desktop.local:3847", "devcred_desktop", "device_desktop"))
        val gateway = DefaultSessionGateway(
            credentialStore = store,
            credentialHolder = holder,
        )

        gateway.refresh()

        assertEquals("devcred_laptop", holder.credentialFor("http://laptop.local:3847"))
        assertEquals("devcred_desktop", holder.credentialFor("http://desktop.local:3847"))
    }

    @Test
    fun refreshOpensConnectionsAfterEachCredentialIsPublished() = runTest {
        val holder = CredentialHolder()
        val store = FakeCredentialStore()
        store.save(saved("http://laptop.local:3847", "devcred_laptop", "device_laptop"))
        store.save(saved("http://desktop.local:3847", "devcred_desktop", "device_desktop"))
        val seen = mutableListOf<String?>()
        val connections = object : HaroldConnections {
            override val connections = kotlinx.coroutines.flow.MutableStateFlow(emptyList<HaroldConnection>())
            override fun onForeground() = Unit
            override fun onBackground() = Unit
            override suspend fun refresh() {
                seen += holder.credentialFor("http://laptop.local:3847")
                seen += holder.credentialFor("http://desktop.local:3847")
            }
            override fun setSessionStates(
                serverOrigin: String,
                states: List<harold.android.contracts.SessionState>,
            ) = Unit
            override fun shouldStayConnected(serverOrigin: String): Boolean = false
        }
        val gateway = DefaultSessionGateway(
            credentialStore = store,
            credentialHolder = holder,
            connections = connections,
        )

        gateway.refresh()

        assertEquals(listOf("devcred_laptop", "devcred_desktop"), seen)
    }

    @Test
    fun publishesTheStoredCredentialForAuthenticatedRequests() = runTest {
        val holder = CredentialHolder()
        val gateway = DefaultSessionGateway(
            credentialStore = FakeCredentialStore(
                StoredCredential(
                    formatVersion = 1,
                    deviceId = "device_01",
                    serverOrigin = "http://127.0.0.1:8787",
                    deviceName = "Pixel",
                    credential = "devcred_secret",
                    name = "laptop",
                    colorId = "ink",
                    iconId = "mark",
                ),
            ),
            credentialHolder = holder,
        )

        gateway.refresh()

        assertEquals("devcred_secret", holder.credentialFor("http://127.0.0.1:8787"))
    }

    @Test
    fun clearsThePublishedCredentialWhenNothingIsStored() = runTest {
        val holder = CredentialHolder()
        holder.publish(mapOf("http://127.0.0.1:8787" to "devcred_stale"))
        val gateway = DefaultSessionGateway(
            credentialStore = FakeCredentialStore(null),
            credentialHolder = holder,
        )

        gateway.refresh()

        assertNull(holder.credentialFor("http://127.0.0.1:8787"))
        assertEquals(PairedState.NotPaired, gateway.pairedState.value)
    }

    @Test
    fun clearLocalAccessDeletesStoreAndReturnsToNotPaired() = runTest {
        val holder = CredentialHolder()
        val store = FakeCredentialStore(
            StoredCredential(
                formatVersion = 1,
                deviceId = "device_01",
                serverOrigin = "http://127.0.0.1:8787",
                deviceName = "Pixel",
                credential = "devcred_secret",
                name = "laptop",
                colorId = "ink",
                iconId = "mark",
            ),
        )
        val gateway = DefaultSessionGateway(
            credentialStore = store,
            credentialHolder = holder,
        )

        gateway.refresh()
        gateway.clearLocalAccess()

        assertNull(holder.credentialFor("http://127.0.0.1:8787"))
        assertEquals(emptyList<StoredCredential>(), store.list())
        assertEquals(1, store.clearCount)
        assertEquals(PairedState.NotPaired, gateway.pairedState.value)
    }
}

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
