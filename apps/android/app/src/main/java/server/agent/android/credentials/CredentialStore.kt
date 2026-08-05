package server.agent.android.credentials

interface CredentialStore {
    suspend fun load(): StoredCredential?

    suspend fun save(credential: StoredCredential)

    suspend fun clear()
}
