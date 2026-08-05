package server.agent.android.session

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import server.agent.android.credentials.CredentialHolder
import server.agent.android.credentials.CredentialStore
import server.agent.android.credentials.StoredCredential

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
}

private class FakeCredentialStore(
    private val stored: StoredCredential?,
) : CredentialStore {
    override suspend fun load(): StoredCredential? = stored

    override suspend fun save(credential: StoredCredential) = Unit

    override suspend fun clear() = Unit
}
