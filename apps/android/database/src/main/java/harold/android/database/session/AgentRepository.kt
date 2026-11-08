package harold.android.database.session

import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.network.AgentSettingsApi
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class CachedAgent(
    val connectionId: String,
    val agentId: AgentId,
    val displayName: String,
    val enabled: Boolean,
)

/** Room-backed agent identity cache. Session state does not live here. */
interface AgentRepository {
    fun observeAgents(connectionId: String): Flow<List<CachedAgent>>

    fun observeAllAgents(): Flow<List<CachedAgent>>

    suspend fun refreshAgents(connectionId: String): Result<List<AgentSettings>>
}

class DefaultAgentRepository @Inject constructor(
    private val agentSettingsApi: AgentSettingsApi,
    private val agentDao: AgentDao,
) : AgentRepository {
    override fun observeAgents(connectionId: String): Flow<List<CachedAgent>> =
        agentDao.observeByOrigin(connectionId).map(::cached)

    override fun observeAllAgents(): Flow<List<CachedAgent>> =
        agentDao.observeAll().map(::cached)

    override suspend fun refreshAgents(connectionId: String): Result<List<AgentSettings>> {
        val result = agentSettingsApi.listAgents(connectionId)
        if (result.isFailure) {
            return Result.failure(checkNotNull(result.exceptionOrNull()))
        }
        val agents = result.getOrThrow().items
        agentDao.replaceByOrigin(
            connectionId = connectionId,
            agents = agents.mapIndexed { position, agent ->
                agent.toEntity(connectionId, position)
            },
        )
        return Result.success(agents)
    }

    private fun cached(entities: List<AgentEntity>): List<CachedAgent> = entities.map { agent ->
        CachedAgent(
            connectionId = agent.connectionId,
            agentId = agent.agentId,
            displayName = agent.displayName,
            enabled = agent.enabled,
        )
    }
}

private fun AgentSettings.toEntity(
    connectionId: String,
    position: Int,
): AgentEntity = AgentEntity(
    connectionId = connectionId,
    agentId = id,
    displayName = displayName,
    available = available,
    enabled = enabled,
    path = path,
    position = position,
)
