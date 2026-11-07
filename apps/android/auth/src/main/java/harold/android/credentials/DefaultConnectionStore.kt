package harold.android.credentials

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first

class DefaultConnectionStore internal constructor(
    private val dataStore: DataStore<Preferences>,
    private val cipher: CredentialCipher,
) : ConnectionStore {
    constructor(context: Context) : this(
        dataStore = PreferenceDataStoreFactory.create {
            context.getNoBackupFilesDir().resolve(ROSTER_PREFERENCES_FILE)
        },
        cipher = KeystoreCipher(),
    )

    override suspend fun list(): List<SavedConnection> = readSaved()

    override suspend fun save(credential: SavedConnection) {
        writeSaved(upsertSavedConnection(readSaved(), credential))
    }

    override suspend fun replace(credential: SavedConnection) {
        writeSaved(listOf(credential))
    }

    override suspend fun remove(connectionId: String) {
        val remaining = readSaved().filter { connection -> connection.connectionId != connectionId }
        if (remaining.isEmpty()) {
            clear()
            return
        }
        writeSaved(remaining)
    }

    override suspend fun clear() {
        dataStore.edit { preferences -> preferences.clear() }
        cipher.deleteKey()
    }

    private suspend fun readSaved(): List<SavedConnection> {
        val preferences = dataStore.data.first()
        val iv = preferences[KEY_ROSTER_IV] ?: return emptyList()
        val ciphertext = preferences[KEY_ROSTER_CIPHERTEXT] ?: return emptyList()
        val json = cipher.decrypt(
            EncryptedBlob(
                ivBase64 = iv,
                ciphertextBase64 = ciphertext,
            ),
        )
        return decodeSavedConnections(json)
    }

    private suspend fun writeSaved(saved: List<SavedConnection>) {
        val encrypted = cipher.encrypt(encodeSavedConnections(saved))
        dataStore.edit { preferences ->
            preferences.clear()
            preferences[KEY_ROSTER_IV] = encrypted.ivBase64
            preferences[KEY_ROSTER_CIPHERTEXT] = encrypted.ciphertextBase64
        }
    }

    companion object {
        private const val ROSTER_PREFERENCES_FILE = "harold-roster.preferences_pb"
        private val KEY_ROSTER_IV = stringPreferencesKey("roster_iv")
        private val KEY_ROSTER_CIPHERTEXT = stringPreferencesKey("roster_ciphertext")
    }
}
