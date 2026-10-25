package harold.android.cache

/**
 * The local read cache is owned by feature slices, but removing a host crosses
 * all of them. The app implements this port over the Room database.
 */
fun interface LocalCacheCleaner {
    suspend fun deleteByOrigin(serverOrigin: String)
}
