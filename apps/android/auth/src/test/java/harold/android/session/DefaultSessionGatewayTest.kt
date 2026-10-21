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

        assertNull(holder.current())
        assertEquals(emptyList<StoredCredential>(), store.list())
        assertEquals(1, store.clearCount)
        assertEquals(PairedState.NotPaired, gateway.pairedState.value)
    }
}
