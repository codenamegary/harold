package harold.android.credentials

interface SshCredentialStore {
    suspend fun list(): List<SshCredential>

    suspend fun save(credential: SshCredential)

    suspend fun remove(id: String)

    suspend fun touch(id: String)
}
