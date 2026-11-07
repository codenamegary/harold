package harold.android.credentials

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
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
    fun savesAndRestoresConnection() = runTest {
        val credential = SavedConnection(
            formatVersion = 3,
            connectionId = "ssh://gary@127.0.0.1:22",
            deviceName = "Google Pixel 8",
            name = "laptop",
            colorId = "ink",
            iconId = "mark",
            ssh = sshConfig(),
        )

        store.save(credential)

        assertEquals(listOf(credential), store.list())
    }

    @Test
    fun clearRemovesStoredConnection() = runTest {
        store.save(
            SavedConnection(
                formatVersion = 3,
                connectionId = "ssh://gary@127.0.0.1:22",
                deviceName = "Google Pixel 8",
                name = "laptop",
                colorId = "ink",
                iconId = "mark",
                ssh = sshConfig(),
            ),
        )

        store.clear()

        assertEquals(emptyList<SavedConnection>(), store.list())
    }

    @Test
    fun newGatewayRestoresPairedConnectionAfterSimulatedRestart() = runTest {
        val credential = SavedConnection(
            formatVersion = 3,
            connectionId = "ssh://gary@10.0.2.2:22",
            deviceName = "Emulator",
            name = "laptop",
            colorId = "ink",
            iconId = "mark",
            ssh = sshConfig(),
        )
        store.save(credential)

        val gateway = DefaultSessionGateway(credentialStore = store)

        gateway.refresh()

        assertEquals(
            PairedState.Paired(
                connectionId = "ssh://gary@10.0.2.2:22",
                deviceName = "Emulator",
            ),
            gateway.pairedState.value,
        )
    }

    @Test
    fun clearLocalAccessSurvivesAcrossNewGateway() = runTest {
        store.save(
            SavedConnection(
                formatVersion = 3,
                connectionId = "ssh://gary@10.0.2.2:22",
                deviceName = "Emulator",
                name = "laptop",
                colorId = "ink",
                iconId = "mark",
                ssh = sshConfig(),
            ),
        )

        val first = DefaultSessionGateway(credentialStore = store)
        first.refresh()
        first.clearLocalAccess()

        val second = DefaultSessionGateway(credentialStore = store)
        second.refresh()

        assertEquals(PairedState.NotPaired, second.pairedState.value)
        assertEquals(emptyList<SavedConnection>(), store.list())
    }

    private fun sshConfig() = SshConfig(
        host = "host.local",
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    )

    companion object {
        private lateinit var store: DefaultConnectionStore

        @JvmStatic
        @BeforeClass
        fun createStore() {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            store = DefaultConnectionStore(context.applicationContext)
        }
    }
}
