package harold.android.credentials

interface ConnectionStore {
    suspend fun list(): List<SavedConnection>

    suspend fun save(credential: SavedConnection)

    suspend fun replace(credential: SavedConnection)

    suspend fun remove(connectionId: String)

    suspend fun clear()
}
