package harold.android.session

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import harold.android.credentials.CredentialHolder
import harold.android.credentials.CredentialStore
import harold.android.credentials.StoredCredential

class DefaultSessionGatewayTest {
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
                ),
            ),
            credentialHolder = holder,
        )

        gateway.refresh()

        assertEquals("devcred_secret", holder.current())
    }

    @Test
    fun clearsThePublishedCredentialWhenNothingIsStored() = runTest {
        val holder = CredentialHolder()
        holder.set("devcred_stale")
        val gateway = DefaultSessionGateway(
            credentialStore = FakeCredentialStore(null),
            credentialHolder = holder,
        )

        gateway.refresh()

        assertNull(holder.current())
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
            ),
        )
        val gateway = DefaultSessionGateway(
            credentialStore = store,
            credentialHolder = holder,
        )

        gateway.refresh()
        gateway.clearLocalAccess()

        assertNull(holder.current())
        assertNull(store.load())
        assertEquals(1, store.clearCount)
        assertEquals(PairedState.NotPaired, gateway.pairedState.value)
    }
}

private class FakeCredentialStore(
    private var stored: StoredCredential?,
) : CredentialStore {
    var clearCount = 0
        private set

    override suspend fun load(): StoredCredential? = stored

    override suspend fun save(credential: StoredCredential) {
        stored = credential
    }

    override suspend fun clear() {
        clearCount += 1
        stored = null
    }
}
