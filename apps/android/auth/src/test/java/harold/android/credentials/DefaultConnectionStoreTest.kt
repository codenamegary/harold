package harold.android.credentials

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class DefaultCredentialStoreTest {
    @Test
    fun savingASecondHaroldKeepsTheFirst() = runTest {
        val store = newStore()
        val laptop = storedConnection(
            connectionId = "http://laptop.local:3847",
            credential = "devcred_laptop",
            name = "laptop",
        )
        val desktop = storedConnection(
            connectionId = "http://desktop.local:3847",
            credential = "devcred_desktop",
            name = "desktop",
        )

        store.save(laptop)
        store.save(desktop)

        assertEquals(listOf(laptop, desktop), store.list())
    }

    @Test
    fun replaceKeepsOnlyTheNewHarold() = runTest {
        val store = newStore()
        store.save(
            storedConnection(
                connectionId = "http://laptop.local:3847",
                credential = "devcred_laptop",
                name = "laptop",
            ),
        )
        val phone = storedConnection(
            connectionId = "http://phone.local:3847",
            credential = "devcred_phone",
            name = "phone",
        )

        store.replace(phone)

        assertEquals(listOf(phone), store.list())
    }

    @Test
    fun clearRemovesEverySavedConnection() = runTest {
        val store = newStore()
        store.save(
            storedConnection(
                connectionId = "http://laptop.local:3847",
                credential = "devcred_laptop",
                name = "laptop",
            ),
        )

        store.clear()

        assertEquals(emptyList<SavedConnection>(), store.list())
    }

    @Test
    fun removeDropsOneHaroldAndKeepsTheOther() = runTest {
        val store = newStore()
        val laptop = storedConnection(
            connectionId = "http://laptop.local:3847",
            credential = "devcred_laptop",
            name = "laptop",
        )
        val desktop = storedConnection(
            connectionId = "http://desktop.local:3847",
            credential = "devcred_desktop",
            name = "desktop",
        )
        store.save(laptop)
        store.save(desktop)

        store.remove(laptop.connectionId)

        assertEquals(listOf(desktop), store.list())
    }
}

private fun newStore(): DefaultConnectionStore {
    val file = File.createTempFile("harold-roster", ".preferences_pb")
    file.delete()
    return DefaultConnectionStore(
        dataStore = PreferenceDataStoreFactory.create { file },
        cipher = IdentityCipher(),
    )
}

private class IdentityCipher : CredentialCipher {
    override fun encrypt(plaintext: String): EncryptedBlob = EncryptedBlob(
        ivBase64 = "iv",
        ciphertextBase64 = plaintext,
    )

    override fun decrypt(blob: EncryptedBlob): String = blob.ciphertextBase64

    override fun deleteKey() = Unit
}

private fun storedConnection(
    connectionId: String,
    credential: String,
    name: String,
) = SavedConnection(
    formatVersion = 3,
    connectionId = connectionId,
    deviceName = "Pixel",
    name = name,
    colorId = "ink",
    iconId = "mark",
    ssh = SshConfig(
        host = connectionId,
        port = 22,
        user = "gary",
        auth = SshAuth.Password(secret = "hunter2"),
        hostKeyFingerprint = "SHA256:abc",
    ),
)
