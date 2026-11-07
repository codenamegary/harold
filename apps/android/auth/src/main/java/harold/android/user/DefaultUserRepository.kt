package harold.android.user

import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.UpdateAgentBody
import harold.android.network.AgentApi
import javax.inject.Inject

class DefaultUserRepository @Inject constructor(
    private val agentApi: AgentApi,
) : UserRepository {
    override suspend fun listWorkspaces(
        connectionId: String,
        limit: Int,
    ) = agentApi.listWorkspaces(connectionId, limit)

    override suspend fun listFilesystemDirectories(
        connectionId: String,
        root: String?,
    ) = agentApi.listFilesystemDirectories(connectionId, root)

    override suspend fun createFilesystemDirectory(
        connectionId: String,
        body: CreateFilesystemDirectoryBody,
    ) = agentApi.createFilesystemDirectory(connectionId, body)

    override suspend fun createWorkspace(
        connectionId: String,
        body: CreateWorkspaceBody,
    ) = agentApi.createWorkspace(connectionId, body)

    override suspend fun listSessions(
        connectionId: String,
        cwd: String?,
    ) = agentApi.listSessions(connectionId, cwd)

    override suspend fun listAgents(connectionId: String) = agentApi.listAgents(connectionId)

    override suspend fun scanAgents(connectionId: String) = agentApi.scanAgents(connectionId)

    override suspend fun updateAgent(
        connectionId: String,
        agentId: AgentId,
        body: UpdateAgentBody,
    ) = agentApi.updateAgent(connectionId, agentId, body)

    override suspend fun createCustomAgent(
        connectionId: String,
        body: CreateCustomAgentBody,
    ) = agentApi.createCustomAgent(connectionId, body)

    override suspend fun deleteAgent(connectionId: String, agentId: AgentId) =
        agentApi.deleteAgent(connectionId, agentId)

    override suspend fun reloadConfig(connectionId: String) = agentApi.reloadConfig(connectionId)

    override suspend fun restartAgent(connectionId: String, agentId: AgentId) =
        agentApi.restartAgent(connectionId, agentId)

    override suspend fun getAgentCapabilities(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) = agentApi.getAgentCapabilities(connectionId, agentId, sessionId)

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ) = agentApi.createSession(connectionId, body)

    override suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) = agentApi.deleteSession(connectionId, agentId, sessionId)

    override suspend fun getAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ) = agentApi.getAgentAuth(connectionId, agentId)

    override suspend fun logoutAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ) = agentApi.logoutAgentAuth(connectionId, agentId)
}
