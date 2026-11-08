package harold.android.transport.ssh

interface SshConnectionPool {
    suspend fun acquire(connectionId: String): SshConnectionLease

    /** Stable key for a saved connection: host, port, user, credential fingerprint, pinned host key. */
    suspend fun keyFor(connectionId: String): String

    /** Closes the key only when no other saved connection maps to it. */
    suspend fun close(connectionId: String)

    fun closeKey(key: String)

    fun closeAll()

    fun trimIdle(idleMillis: Long = DEFAULT_IDLE_MILLIS)

    companion object {
        const val DEFAULT_IDLE_MILLIS: Long = 10 * 60 * 1000L
    }
}
