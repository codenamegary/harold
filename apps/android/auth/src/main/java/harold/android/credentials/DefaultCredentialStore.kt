package harold.android.credentials

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import kotlinx.coroutines.flow.first

class DefaultCredentialStore(
    context: Context,
    private val cipher: KeystoreCipher = KeystoreCipher(),
) : CredentialStore {
    private val dataStore: DataStore<Preferences> = PreferenceDataStoreFactory.create {
        context.getNoBackupFilesDir().resolve(PREFERENCES_FILE_NAME)
    }

    override suspend fun load(): StoredCredential? {
        val preferences = dataStore.data.first()
        val formatVersion = preferences[KEY_FORMAT_VERSION] ?: return null
        val deviceId = preferences[KEY_DEVICE_ID] ?: return null
        val serverOrigin = preferences[KEY_SERVER_ORIGIN] ?: return null
        val ivBase64 = preferences[KEY_IV] ?: return null
        val ciphertextBase64 = preferences[KEY_CIPHERTEXT] ?: return null

        val decryptedCredential = cipher.decrypt(
            EncryptedBlob(
                ivBase64 = ivBase64,
                ciphertextBase64 = ciphertextBase64,
            ),
        )

        return StoredCredential(
            formatVersion = formatVersion,
            deviceId = deviceId,
            serverOrigin = serverOrigin,
            deviceName = preferences[KEY_DEVICE_NAME],
            credential = decryptedCredential,
        )
    }

    override suspend fun save(credential: StoredCredential) {
        val encrypted = cipher.encrypt(credential.credential)

        dataStore.edit { preferences ->
            preferences[KEY_FORMAT_VERSION] = credential.formatVersion
            preferences[KEY_DEVICE_ID] = credential.deviceId
            preferences[KEY_SERVER_ORIGIN] = credential.serverOrigin

            if (credential.deviceName == null) {
                preferences.remove(KEY_DEVICE_NAME)
            } else {
                preferences[KEY_DEVICE_NAME] = credential.deviceName
            }

            preferences[KEY_IV] = encrypted.ivBase64
            preferences[KEY_CIPHERTEXT] = encrypted.ciphertextBase64
        }
    }

    override suspend fun clear() {
        dataStore.edit { it.clear() }
        cipher.deleteKey()
    }

    companion object {
        private const val PREFERENCES_FILE_NAME = "credential.preferences_pb"
        private val KEY_FORMAT_VERSION = intPreferencesKey("format_version")
        private val KEY_DEVICE_ID = stringPreferencesKey("device_id")
        private val KEY_SERVER_ORIGIN = stringPreferencesKey("server_origin")
        private val KEY_DEVICE_NAME = stringPreferencesKey("device_name")
        private val KEY_IV = stringPreferencesKey("iv")
        private val KEY_CIPHERTEXT = stringPreferencesKey("ciphertext")
    }
}
