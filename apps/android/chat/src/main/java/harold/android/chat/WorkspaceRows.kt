package harold.android.chat

import harold.android.contracts.WorkspaceState
import harold.android.credentials.SavedConnection
import harold.android.database.workspace.CachedWorkspace

/**
 * Builds the saved-workspace rows both pickers offer. Rows are limited to the
 * target origins and available folders, sorted most recently used first, and
 * scoped as `<connectionId>|<workspaceId>` whenever saved connections exist.
 * Duplicate names get a parent-path suffix.
 */
internal fun workspaceRows(
    cached: List<CachedWorkspace>,
    origins: Collection<String>,
    savedConnections: List<SavedConnection>,
): List<WorkspaceRow> {
    val savedByOrigin = savedConnections.associateBy { connection -> connection.connectionId }
    val scoped = savedConnections.isNotEmpty()
    return disambiguateWorkspaceLabels(
        cached
            .asSequence()
            .filter { cachedWorkspace -> cachedWorkspace.connectionId in origins }
            .mapNotNull { cachedWorkspace ->
                val workspace = cachedWorkspace.workspace
                if (workspace.state != WorkspaceState.Available) {
                    return@mapNotNull null
                }
                val connection = savedByOrigin[cachedWorkspace.connectionId]
                workspace.toWorkspaceRow().copy(
                    id = scopedWorkspaceId(
                        connectionId = cachedWorkspace.connectionId,
                        workspaceId = workspace.id,
                        scoped = scoped,
                    ),
                    connectionId = cachedWorkspace.connectionId,
                    connectionName = connection?.name.orEmpty(),
                    connectionColorId = connection?.colorId.orEmpty(),
                    connectionIconId = connection?.iconId.orEmpty(),
                )
            }
            .sortedWith(recentWorkspaceOrder)
            .toList(),
    )
}

/** The picker id for one host workspace. */
internal fun scopedWorkspaceId(
    connectionId: String,
    workspaceId: String,
    scoped: Boolean,
): String = if (scoped) "$connectionId|$workspaceId" else workspaceId

/** Newest use first, then name and path so equal timestamps stay stable. */
internal val recentWorkspaceOrder: Comparator<WorkspaceRow> =
    compareByDescending<WorkspaceRow> { row -> row.lastUsedAt }
        .thenBy { row -> row.name }
        .thenBy { row -> row.path }
