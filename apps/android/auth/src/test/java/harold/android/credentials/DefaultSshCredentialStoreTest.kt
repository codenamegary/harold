package harold.android.credentials

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import java.io.File
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DefaultSshCredentialStoreTest {
    @Test
    fun keysAndPasswordsRoundTrip() = runTest {
        val store = newStore()
        val key = credential(
            id = "key_1",
            name = "Phone key",
            kind = SshCredentialKind.PrivateKey,
            privateKeyPem = "-----BEGIN OPENSSH PRIVATE KEY-----\nkey\n-----END OPENSSH PRIVATE KEY-----",
            publicKey = "ssh-ed25519 AAAA phone",
        )
        val password = credential(
            id = "password_1",
            name = "Host password",
            kind = SshCredentialKind.Password,
            password = "secret",
        )

        store.save(key)
        store.save(password)

        assertEquals(listOf(key, password), store.list())
    }

    @Test
    fun savingTheSameIdReplacesThatCredential() = runTest {
        val store = newStore()
        val original = credential(
            id = "key_1",
            name = "Phone key",
            kind = SshCredentialKind.PrivateKey,
            privateKeyPem = "old",
            publicKey = "ssh-ed25519 old",
        )
        val renamed = original.copy(name = "Work key", publicKey = "ssh-ed25519 new")

        store.save(original)
        store.save(renamed)

        assertEquals(listOf(renamed), store.list())
    }

    @Test
    fun removeDeletesOnlyThatCredential() = runTest {
        val store = newStore()
        val key = credential(
            id = "key_1",
            name = "Phone key",
            kind = SshCredentialKind.PrivateKey,
            privateKeyPem = "key",
            publicKey = "ssh-ed25519 phone",
        )
        val password = credential(
            id = "password_1",
            name = "Host password",
            kind = SshCredentialKind.Password,
            password = "secret",
        )
        store.save(key)
        store.save(password)

        store.remove(key.id)

        assertEquals(listOf(password), store.list())
    }

    @Test
    fun touchUpdatesOnlyLastUsedAt() = runTest {
        val store = newStore()
        val key = credential(
            id = "key_1",
            name = "Phone key",
            kind = SshCredentialKind.PrivateKey,
            privateKeyPem = "key",
            publicKey = "ssh-ed25519 phone",
        )
        store.save(key)

        store.touch(key.id)

        val updated = store.list().single()
        assertEquals(key.copy(lastUsedAt = updated.lastUsedAt), updated)
        assertTrue(updated.lastUsedAt != null)
    }
}

private fun newStore(): DefaultSshCredentialStore {
    val file = File.createTempFile("harold-ssh-credentials", ".preferences_pb")
    file.delete()
    return DefaultSshCredentialStore(
        dataStore = PreferenceDataStoreFactory.create { file },
        cipher = TestCipher(),
    )
}

private class TestCipher : CredentialCipher {
    override fun encrypt(plaintext: String): EncryptedBlob = EncryptedBlob(
        ivBase64 = "iv",
        ciphertextBase64 = plaintext,
    )

    override fun decrypt(blob: EncryptedBlob): String = blob.ciphertextBase64

    override fun deleteKey() = Unit
}

private fun credential(
    id: String,
    name: String,
    kind: SshCredentialKind,
    privateKeyPem: String? = null,
    publicKey: String? = null,
    password: String? = null,
) = SshCredential(
    id = id,
    name = name,
    kind = kind,
    privateKeyPem = privateKeyPem,
    publicKey = publicKey,
    password = password,
    createdAt = "2026-01-01T00:00:00Z",
)
