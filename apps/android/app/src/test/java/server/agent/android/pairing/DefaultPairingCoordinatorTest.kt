package server.agent.android.pairing

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.credentials.CredentialStore
import server.agent.android.credentials.StoredCredential
import server.agent.android.network.ClaimedDevice
import server.agent.android.network.PairingApi
import server.agent.android.network.PairingClaimError
import server.agent.android.network.PairingClaimException
import server.agent.android.network.PairingClaimResult
import server.agent.android.session.DefaultSessionGateway
import server.agent.android.session.PairedState

class DefaultPairingCoordinatorTest {
    @Test
    fun keepsExistingCredentialWhenClaimFails() = runTest {
        val store = FakeCredentialStore(
            initial = StoredCredential(
                formatVersion = 1,
                deviceId = "device_old",
                serverOrigin = "https://old.example.com",
                deviceName = "Old device",
                credential = "devcred_old",
            ),
        )
        val gateway = DefaultSessionGateway(store)
        gateway.refresh()
        val coordinator = DefaultPairingCoordinator(
            pairingApi = FakePairingApi(
                result = Result.failure(
                    PairingClaimException(
                        PairingClaimError.Problem(
                            title = "Pairing failed",
                            detail = "Pairing code has already been claimed",
                            status = 409,
                        ),
                    ),
                ),
            ),
            credentialStore = store,
            sessionGateway = gateway,
        )

        val result = coordinator.pair(
            endpoint = "http://127.0.0.1:3847",
            code = "R7K-4MP",
            deviceName = "Google Pixel 8",
        )

        assertTrue(result.isFailure)
        assertEquals("devcred_old", store.load()?.credential)
        assertTrue(gateway.pairedState.value is PairedState.Paired)
    }

    @Test
    fun swapsCredentialAfterSuccessfulClaim() = runTest {
        val store = FakeCredentialStore(
            initial = StoredCredential(
                formatVersion = 1,
                deviceId = "device_old",
                serverOrigin = "https://old.example.com",
                deviceName = "Old device",
                credential = "devcred_old",
            ),
        )
        val gateway = DefaultSessionGateway(store)
        gateway.refresh()
        val coordinator = DefaultPairingCoordinator(
            pairingApi = FakePairingApi(
                result = Result.success(
                    PairingClaimResult(
                        device = ClaimedDevice(
                            id = "device_new",
                            name = "Google Pixel 8",
                            platform = "android",
                        ),
                        credential = "devcred_new",
                    ),
                ),
            ),
            credentialStore = store,
            sessionGateway = gateway,
        )

        val result = coordinator.pair(
            endpoint = "http://127.0.0.1:3847",
            code = "J7K-9P2",
            deviceName = "Google Pixel 8",
        )

        assertTrue(result.isSuccess)
        assertEquals("devcred_new", store.load()?.credential)
        assertEquals("device_new", store.load()?.deviceId)
    }
}

private class FakeCredentialStore(
    initial: StoredCredential?,
) : CredentialStore {
    private var stored: StoredCredential? = initial

    override suspend fun load(): StoredCredential? = stored

    override suspend fun save(credential: StoredCredential) {
        stored = credential
    }

    override suspend fun clear() {
        stored = null
    }
}

private class FakePairingApi(
    private val result: Result<PairingClaimResult>,
) : PairingApi {
    override suspend fun claim(
        endpoint: String,
        code: String,
        name: String,
        platform: String,
    ): Result<PairingClaimResult> = result
}
