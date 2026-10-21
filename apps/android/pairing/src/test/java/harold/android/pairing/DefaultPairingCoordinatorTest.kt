package harold.android.pairing

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.credentials.StoredCredential
import harold.android.testing.FakeCredentialStore
import harold.android.network.ClaimedDevice
import harold.android.network.PairingApi
import harold.android.network.PairingClaimError
import harold.android.network.PairingClaimException
import harold.android.network.PairingClaimResult
import harold.android.session.DefaultSessionGateway
import harold.android.session.PairedState

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
                name = "old",
                colorId = "ink",
                iconId = "mark",
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
            appearance = HaroldAppearance(name = "loopback", colorId = "tide", iconId = "bolt"),
        )

        assertTrue(result.isFailure)
        assertEquals("devcred_old", store.list().single().credential)
        assertTrue(gateway.pairedState.value is PairedState.Paired)
    }

    @Test
    fun addsAHaroldAndKeepsTheOneAlreadySaved() = runTest {
        val store = FakeCredentialStore(
            initial = StoredCredential(
                formatVersion = 1,
                deviceId = "device_old",
                serverOrigin = "https://old.example.com",
                deviceName = "Old device",
                credential = "devcred_old",
                name = "old",
                colorId = "ink",
                iconId = "mark",
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

        val appearance = proposedHaroldIdentity(
            serverOrigin = "http://127.0.0.1:3847",
            saved = store.list(),
        )
        val result = coordinator.pair(
            endpoint = "http://127.0.0.1:3847",
            code = "J7K-9P2",
            deviceName = "Google Pixel 8",
            appearance = appearance,
        )

        assertTrue(result.isSuccess)
        val saved = store.list()
        assertEquals(2, saved.size)
        val kept = saved.single { harold -> harold.serverOrigin == "https://old.example.com" }
        assertEquals("devcred_old", kept.credential)
        val added = saved.single { harold -> harold.serverOrigin == "http://127.0.0.1:3847" }
        assertEquals("devcred_new", added.credential)
        assertEquals("device_new", added.deviceId)
        assertEquals("127.0.0.1", added.name)
        assertEquals(haroldColorIds[1], added.colorId)
        assertEquals(haroldIconIds[1], added.iconId)
    }

    @Test
    fun draftForASavedAddressDoesNotClaimAndKeepsTheIdentity() = runTest {
        val api = FakePairingApi(
            result = Result.success(
                PairingClaimResult(
                    device = ClaimedDevice(id = "device_old", name = "Old device", platform = "android"),
                    credential = "devcred_old",
                ),
            ),
        )
        val store = FakeCredentialStore(
            initial = StoredCredential(
                formatVersion = 1,
                deviceId = "device_old",
                serverOrigin = "https://old.example.com",
                deviceName = "Old device",
                credential = "devcred_old",
                name = "work",
                colorId = "tide",
                iconId = "home",
            ),
        )
        val coordinator = DefaultPairingCoordinator(
            pairingApi = api,
            credentialStore = store,
            sessionGateway = DefaultSessionGateway(store),
        )

        val draft = coordinator.draft("https://old.example.com")

        assertEquals(0, api.claims)
        assertTrue(draft.alreadySaved)
        assertEquals(HaroldAppearance(name = "work", colorId = "tide", iconId = "home"), draft.appearance)
    }
}

private class FakePairingApi(
    private val result: Result<PairingClaimResult>,
) : PairingApi {
    var claims: Int = 0
        private set

    override suspend fun claim(
        endpoint: String,
        code: String,
        name: String,
        platform: String,
    ): Result<PairingClaimResult> {
        claims += 1
        return result
    }
}
