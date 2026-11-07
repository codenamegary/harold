package harold.android.database

/**
 * The local read cache spans several features. Removing a host must clear every
 * table for that connection in one transaction.
 */
fun interface LocalCacheCleaner {
    suspend fun deleteByOrigin(connectionId: String)
}
