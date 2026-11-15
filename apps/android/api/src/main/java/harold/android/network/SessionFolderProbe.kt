package harold.android.network

/** Whether the agent can still open a session's working folder on the host. */
enum class SessionFolderState {
    Available,
    Missing,
    Unknown,
}

/**
 * Checks the host filesystem for a session working folder. A folder can be
 * missing even when no workspace row exists, because sessions may run in any
 * directory and deleted workspace hints are hidden from the workspace list.
 */
fun interface SessionFolderProbe {
    suspend fun probe(connectionId: String, path: String): SessionFolderState
}
