package harold.android.credentials

interface CredentialStore {
    suspend fun list(): List<StoredCredential>

    suspend fun save(credential: StoredCredential)

    suspend fun replace(credential: StoredCredential)

    suspend fun clear()
}
