package harold.android.testing

import harold.android.credentials.CredentialStore
import harold.android.credentials.StoredCredential
import harold.android.credentials.upsertSavedHarold

class FakeCredentialStore(
    initial: StoredCredential? = null,
) : CredentialStore {
    private val saved = mutableListOf<StoredCredential>()

    var clearCount: Int = 0
        private set

    init {
        if (initial != null) {
            saved += initial
        }
    }

    override suspend fun list(): List<StoredCredential> = saved.toList()

    override suspend fun save(credential: StoredCredential) {
        val next = upsertSavedHarold(saved.toList(), credential)
        saved.clear()
        saved.addAll(next)
    }

    override suspend fun replace(credential: StoredCredential) {
        saved.clear()
        saved += credential
    }

    override suspend fun clear() {
        clearCount += 1
        saved.clear()
    }
}
