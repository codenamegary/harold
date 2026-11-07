package harold.android.credentials

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import java.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class DefaultSshCredentialStore internal constructor(
    private val dataStore: DataStore<Preferences>,
    private val cipher: CredentialCipher,
) : SshCredentialStore {
    constructor(context: Context) : this(
        dataStore = PreferenceDataStoreFactory.create {
            context.getNoBackupFilesDir().resolve(PREFERENCES_FILE)
        },
        cipher = KeystoreCipher(KEY_ALIAS),
    )

    override suspend fun list(): List<SshCredential> = read()

    override suspend fun save(credential: SshCredential) {
        val current = read()
        val index = current.indexOfFirst { item -> item.id == credential.id }
        val next = if (index < 0) {
            current + credential
        } else {
            current.mapIndexed { i, item -> if (i == index) credential else item }
        }
        write(next)
    }

    override suspend fun remove(id: String) {
        val next = read().filterNot { credential -> credential.id == id }
        if (next.isEmpty()) {
            dataStore.edit { preferences -> preferences.clear() }
        } else {
            write(next)
        }
    }

    override suspend fun touch(id: String) {
        val current = read()
        val now = Instant.now().toString()
        val next = current.map { credential ->
            if (credential.id == id) credential.copy(lastUsedAt = now) else credential
        }
        if (next != current) {
            write(next)
        }
    }

    private suspend fun read(): List<SshCredential> {
        val preferences = dataStore.data.first()
        val iv = preferences[KEY_IV] ?: return emptyList()
        val ciphertext = preferences[KEY_CIPHERTEXT] ?: return emptyList()
        val payload = runCatching {
            cipher.decrypt(EncryptedBlob(ivBase64 = iv, ciphertextBase64 = ciphertext))
        }.getOrNull() ?: return emptyList()
        return runCatching {
            json.decodeFromString<List<SshCredential>>(payload)
        }.getOrDefault(emptyList())
    }

    private suspend fun write(saved: List<SshCredential>) {
        val encrypted = cipher.encrypt(json.encodeToString(saved))
        dataStore.edit { preferences ->
            preferences.clear()
            preferences[KEY_IV] = encrypted.ivBase64
            preferences[KEY_CIPHERTEXT] = encrypted.ciphertextBase64
        }
    }

    companion object {
        private const val PREFERENCES_FILE = "harold-ssh-credentials.preferences_pb"
        private const val KEY_ALIAS = "harold_ssh_credential_key"
        private val KEY_IV = stringPreferencesKey("ssh_credentials_iv")
        private val KEY_CIPHERTEXT = stringPreferencesKey("ssh_credentials_ciphertext")
        private val json = Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }
    }
}
