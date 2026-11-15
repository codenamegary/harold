package harold.android.chat

import harold.android.database.session.SessionListItem
import harold.android.contracts.AgentId
import harold.android.contracts.Session
import harold.android.contracts.SessionState

fun Session.toSessionRow(
    workspaceByPath: Map<String, WorkspaceRow>,
    agentLabels: Map<AgentId, String>,
): SessionRow {
    val workspace = workspaceByPath[cwd]
    return SessionRow(
        sessionId = sessionId,
        name = title.ifBlank { sessionId },
        cwd = cwd,
        workspaceId = workspace?.id.orEmpty(),
        workspaceLabel = workspace?.name ?: cwd,
        agentId = agentId,
        agentLabel = agentLabels[agentId] ?: agentId,
        state = SessionState.Idle,
        updatedAt = updatedAt,
        worktreePath = worktreePath,
    )
}

fun SessionListItem.toSessionRow(): SessionRow = SessionRow(
    sessionId = session.sessionId,
    name = session.title.ifBlank { session.sessionId },
    cwd = session.cwd,
    workspaceId = workspaceId,
    workspaceLabel = workspaceName,
    agentId = session.agentId,
    agentLabel = agentLabel,
    state = if (unavailable) SessionState.Unavailable else SessionState.Idle,
    updatedAt = session.updatedAt,
    connectionId = connectionId,
    worktreePath = session.worktreePath,
    stale = stale,
)

/**
 * Every connection a session refresh must cover. Saved connections set the
 * scope when present. The selected and watched sessions are always included so
 * stale or empty saved-connection metadata cannot filter the open session out
 * of the catalog.
 */
internal fun sessionRefreshOrigins(
    saved: List<String>,
    active: String?,
    selected: String?,
    watched: String?,
): List<String> {
    val scope = if (saved.isNotEmpty()) saved else listOfNotNull(active)
    return (scope + listOfNotNull(selected, watched))
        .filter { origin -> origin.isNotBlank() }
        .distinct()
}
