package harold.android.network

/** Whether the agent can still open a session's working folder on the host. */
enum class SessionFolderState {
    Available,
    Missing,
    Unknown,
}

/**
 * Checks the host filesystem for a session working folder. A folder can be
 * missing even when the host still knows the session, because sessions may run
 * in any directory.
 */
fun interface SessionFolderProbe {
    suspend fun probe(connectionId: String, path: String): SessionFolderState
}
