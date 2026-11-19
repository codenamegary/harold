package harold.android.network

/**
 * One session folder hint. The catalog keeps hints in memory; the host filters
 * them to recent, available folders and never writes them to workspaces.json.
 */
data class SessionDirectoryHint(
    val path: String,
    val lastUsedAt: String = "",
    val unavailable: Boolean = false,
)

/**
 * Session working directories the host can offer as recent-folder hints
 * without persisting a per-session file. Implemented by the ACP catalog.
 */
fun interface SessionDirectoryProvider {
    fun sessionDirectories(connectionId: String): List<String>

    /**
     * Hints with the metadata needed to filter out old, hidden, or unavailable
     * folders. Providers that only know paths keep the plain directory list.
     */
    fun sessionFolderHints(connectionId: String): List<SessionDirectoryHint> =
        sessionDirectories(connectionId).map { path -> SessionDirectoryHint(path = path) }
}
