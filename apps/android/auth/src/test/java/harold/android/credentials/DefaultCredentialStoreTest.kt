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
        val laptop = storedHarold(
            serverOrigin = "http://laptop.local:3847",
            credential = "devcred_laptop",
            name = "laptop",
        )
        val desktop = storedHarold(
            serverOrigin = "http://desktop.local:3847",
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
            storedHarold(
                serverOrigin = "http://laptop.local:3847",
                credential = "devcred_laptop",
                name = "laptop",
            ),
        )
        val phone = storedHarold(
            serverOrigin = "http://phone.local:3847",
            credential = "devcred_phone",
            name = "phone",
        )

        store.replace(phone)

        assertEquals(listOf(phone), store.list())
    }

    @Test
    fun clearRemovesEverySavedHarold() = runTest {
        val store = newStore()
        store.save(
            storedHarold(
                serverOrigin = "http://laptop.local:3847",
                credential = "devcred_laptop",
                name = "laptop",
            ),
        )

        store.clear()

        assertEquals(emptyList<StoredCredential>(), store.list())
    }

    @Test
    fun removeDropsOneHaroldAndKeepsTheOther() = runTest {
        val store = newStore()
        val laptop = storedHarold(
            serverOrigin = "http://laptop.local:3847",
            credential = "devcred_laptop",
            name = "laptop",
        )
        val desktop = storedHarold(
            serverOrigin = "http://desktop.local:3847",
            credential = "devcred_desktop",
            name = "desktop",
        )
        store.save(laptop)
        store.save(desktop)

        store.remove(laptop.serverOrigin)

        assertEquals(listOf(desktop), store.list())
    }
}

private fun newStore(): DefaultCredentialStore {
    val file = File.createTempFile("harold-roster", ".preferences_pb")
    file.delete()
    return DefaultCredentialStore(
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

private fun storedHarold(
    serverOrigin: String,
    credential: String,
    name: String,
) = StoredCredential(
    formatVersion = 1,
    deviceId = "device_$name",
    serverOrigin = serverOrigin,
    deviceName = "Pixel",
    credential = credential,
    name = name,
    colorId = "ink",
    iconId = "mark",
)
