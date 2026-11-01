package harold.android.navigation

import harold.android.contracts.AgentId
import kotlinx.serialization.Serializable

/** The workspace and agent a session was started with, scoped to one Harold. */
@Serializable
data class LastSessionSelection(
    val serverOrigin: String,
    val workspaceId: String,
    val agentId: AgentId,
)

interface SessionPreferences {
    suspend fun loadLastSessionSelection(): LastSessionSelection?

    suspend fun saveLastSessionSelection(selection: LastSessionSelection)

    suspend fun loadLastModel(serverOrigin: String, agentId: AgentId): String?

    suspend fun saveLastModel(serverOrigin: String, agentId: AgentId, model: String)
}
