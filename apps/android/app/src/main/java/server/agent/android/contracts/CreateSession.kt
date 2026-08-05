package server.agent.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class CreateSessionBody(
    val workspaceId: String,
    val agentId: AgentId,
    val text: String,
)

@Serializable
data class CreateSessionResponse(
    val id: String,
    val workspaceId: String,
    val agentId: AgentId,
    val name: String,
    val state: SessionState,
    val createdAt: String,
    val lastUsedAt: String,
    val archivedAt: String?,
    val turnId: String,
)
