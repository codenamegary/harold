package harold.android.chat

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
