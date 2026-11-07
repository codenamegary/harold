package harold.android.testing

import harold.android.credentials.SshCredential
import harold.android.credentials.SshCredentialStore

class FakeSshCredentialStore(
    initial: List<SshCredential> = emptyList(),
) : SshCredentialStore {
    private val saved = initial.toMutableList()

    override suspend fun list(): List<SshCredential> = saved.toList()

    override suspend fun save(credential: SshCredential) {
        val index = saved.indexOfFirst { item -> item.id == credential.id }
        if (index < 0) {
            saved += credential
        } else {
            saved[index] = credential
        }
    }

    override suspend fun remove(id: String) {
        saved.removeAll { credential -> credential.id == id }
    }

    override suspend fun touch(id: String) {
        val index = saved.indexOfFirst { credential -> credential.id == id }
        if (index >= 0) {
            saved[index] = saved[index].copy(lastUsedAt = "touched")
        }
    }
}
