package harold.android.credentials

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith
import harold.android.session.DefaultSessionGateway
import harold.android.session.PairedState

/**
 * DataStore forbids multiple live instances on the same file, so this class keeps
 * one store for the whole instrumented suite.
 */
@RunWith(AndroidJUnit4::class)
class DefaultCredentialStoreInstrumentedTest {
    @Before
    fun clearStore() = runTest {
        store.clear()
    }

    @Test
    fun savesAndRestoresCredential() = runTest {
        val credential = StoredCredential(
            formatVersion = 1,
            deviceId = "device_01",
            serverOrigin = "http://127.0.0.1:3847",
            deviceName = "Google Pixel 8",
            credential = "devcred_roundtrip_secret",
        )

        store.save(credential)

        assertEquals(credential.copy(), store.load())
    }

    @Test
    fun clearRemovesStoredCredential() = runTest {
        store.save(
            StoredCredential(
                formatVersion = 1,
                deviceId = "device_01",
                serverOrigin = "http://127.0.0.1:3847",
                deviceName = "Google Pixel 8",
                credential = "devcred_clear_me",
            ),
        )

        store.clear()

        assertNull(store.load())
    }

    @Test
    fun newGatewayRestoresPairedCredentialAfterSimulatedRestart() = runTest {
        val credential = StoredCredential(
            formatVersion = 1,
            deviceId = "device_restart",
            serverOrigin = "http://10.0.2.2:3847",
            deviceName = "Emulator",
            credential = "devcred_restart_secret",
        )
        store.save(credential)

        val holder = CredentialHolder()
        val gateway = DefaultSessionGateway(
            credentialStore = store,
            credentialHolder = holder,
        )

        gateway.refresh()

        assertEquals("devcred_restart_secret", holder.current())
        assertEquals(
            PairedState.Paired(
                serverOrigin = "http://10.0.2.2:3847",
                deviceId = "device_restart",
                deviceName = "Emulator",
            ),
            gateway.pairedState.value,
        )
    }

    @Test
    fun clearLocalAccessSurvivesAcrossNewGateway() = runTest {
        store.save(
            StoredCredential(
                formatVersion = 1,
                deviceId = "device_clear",
                serverOrigin = "http://10.0.2.2:3847",
                deviceName = "Emulator",
                credential = "devcred_clear",
            ),
        )

        val first = DefaultSessionGateway(
            credentialStore = store,
            credentialHolder = CredentialHolder(),
        )
        first.refresh()
        first.clearLocalAccess()

        val second = DefaultSessionGateway(
            credentialStore = store,
            credentialHolder = CredentialHolder(),
        )
        second.refresh()

        assertEquals(PairedState.NotPaired, second.pairedState.value)
        assertNull(store.load())
    }

    companion object {
        private lateinit var store: DefaultCredentialStore

        @JvmStatic
        @BeforeClass
        fun createStore() {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            store = DefaultCredentialStore(context.applicationContext)
        }
    }
}
