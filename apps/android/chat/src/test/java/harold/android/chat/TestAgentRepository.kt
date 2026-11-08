package harold.android.chat

import harold.android.contracts.AgentSettings
import harold.android.database.session.AgentRepository
import harold.android.database.session.CachedAgent
import harold.android.user.UserRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/** Test double for the Room-backed agent identity cache. */
class TestAgentRepository(
    private val network: UserRepository,
) : AgentRepository {
    private val agents = MutableStateFlow<Map<String, List<CachedAgent>>>(emptyMap())

    override fun observeAgents(connectionId: String): Flow<List<CachedAgent>> =
        agents.map { cached -> cached[connectionId].orEmpty() }

    override fun observeAllAgents(): Flow<List<CachedAgent>> =
        agents.map { cached -> cached.values.flatten() }

    override suspend fun refreshAgents(connectionId: String): Result<List<AgentSettings>> {
        val listed = network.listAgents(connectionId)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        val items = listed.getOrThrow().items
        agents.value = agents.value + (
            connectionId to items.map { agent ->
                CachedAgent(
                    connectionId = connectionId,
                    agentId = agent.id,
                    displayName = agent.displayName,
                    enabled = agent.enabled,
                )
            }
        )
        return Result.success(items)
    }

    fun seedAgents(connectionId: String, agents: List<CachedAgent>) {
        this.agents.value = this.agents.value + (connectionId to agents)
    }
}
