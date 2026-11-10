package harold.android.network

/**
 * Session working directories the host workspace list should include without
 * persisting a per-session file. Implemented by the ACP catalog.
 */
fun interface SessionDirectoryProvider {
    fun sessionDirectories(connectionId: String): List<String>
}
