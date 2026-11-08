package harold.android.network

/** Releases host-side resources tied to a saved connection. */
interface ConnectionResources {
    suspend fun closeConnection(connectionId: String)
}
