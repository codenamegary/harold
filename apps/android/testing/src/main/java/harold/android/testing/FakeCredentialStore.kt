
package harold.android.testing

import harold.android.credentials.CredentialStore
import harold.android.credentials.StoredCredential

class FakeCredentialStore(
    initial: StoredCredential? = null,
) : CredentialStore {
    var stored: StoredCredential? = initial
        private set

    var clearCount: Int = 0
        private set

    override suspend fun load(): StoredCredential? = stored

    override suspend fun save(credential: StoredCredential) {
        stored = credential
    }

    override suspend fun clear() {
        clearCount += 1
        stored = null
    }
}
