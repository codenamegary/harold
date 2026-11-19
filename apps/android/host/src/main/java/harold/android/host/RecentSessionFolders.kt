package harold.android.host

import harold.android.network.SessionDirectoryHint

/**
 * Picks the session folders worth offering as recent workspaces. The rules are
 * pure so they stay testable without an SSH connection: saved folders are
 * already workspaces, hidden folders were deleted by the user, unavailable
 * sessions cannot be opened, and a hint without a last-used time cannot be
 * ordered or shown as recent.
 */
internal object RecentSessionFolders {
    fun select(
        hints: List<SessionDirectoryHint>,
        savedPaths: Set<String>,
        hiddenPaths: Set<String>,
        limit: Int,
    ): List<SessionDirectoryHint> {
        val selected = hints
            .filter { hint ->
                hint.path !in savedPaths &&
                    hint.path !in hiddenPaths &&
                    !hint.unavailable &&
                    hint.lastUsedAt.isNotBlank()
            }
            .sortedByDescending { hint -> hint.lastUsedAt }
            .distinctBy { hint -> hint.path }
        return if (limit > 0) selected.take(limit) else selected
    }
}
