package server.agent.android.credentials

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DefaultCredentialStoreInstrumentedTest {
    private lateinit var store: DefaultCredentialStore

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        store = DefaultCredentialStore(context.applicationContext)
        runTest { store.clear() }
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
}
