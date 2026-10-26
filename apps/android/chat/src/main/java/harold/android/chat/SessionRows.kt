package harold.android.chat

import harold.android.database.session.CachedSession
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
    )
}

fun CachedSession.toSessionRow(): SessionRow = SessionRow(
    sessionId = session.sessionId,
    name = session.title.ifBlank { session.sessionId },
    cwd = session.cwd,
    workspaceId = workspaceId,
    workspaceLabel = workspaceName,
    agentId = session.agentId,
    agentLabel = agentLabel,
    state = SessionState.Idle,
    updatedAt = session.updatedAt,
    serverOrigin = serverOrigin,
)
