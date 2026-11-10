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
import harold.android.network.AcpAgentApi
import harold.android.network.AgentAuthApi
import harold.android.network.AgentSettingsApi
import harold.android.network.WorkspaceApi
import javax.inject.Inject

class DefaultUserRepository @Inject constructor(
    private val workspaceApi: WorkspaceApi,
    private val acpAgentApi: AcpAgentApi,
    private val agentSettingsApi: AgentSettingsApi,
    private val agentAuthApi: AgentAuthApi,
) : UserRepository {
    override suspend fun listWorkspaces(
        connectionId: String,
        limit: Int,
    ) = workspaceApi.listWorkspaces(connectionId, limit)

    override suspend fun listFilesystemDirectories(
        connectionId: String,
        root: String?,
    ) = workspaceApi.listFilesystemDirectories(connectionId, root)

    override suspend fun createFilesystemDirectory(
        connectionId: String,
        body: CreateFilesystemDirectoryBody,
    ) = workspaceApi.createFilesystemDirectory(connectionId, body)

    override suspend fun createWorkspace(
        connectionId: String,
        body: CreateWorkspaceBody,
    ) = workspaceApi.createWorkspace(connectionId, body)

    override suspend fun listSessions(
        connectionId: String,
        cwd: String?,
    ) = acpAgentApi.listSessions(connectionId, cwd)

    override suspend fun listAgents(connectionId: String) = agentSettingsApi.listAgents(connectionId)

    override suspend fun scanAgents(connectionId: String) = agentSettingsApi.scanAgents(connectionId)

    override suspend fun updateAgent(
        connectionId: String,
        agentId: AgentId,
        body: UpdateAgentBody,
    ) = agentSettingsApi.updateAgent(connectionId, agentId, body)

    override suspend fun createCustomAgent(
        connectionId: String,
        body: CreateCustomAgentBody,
    ) = agentSettingsApi.createCustomAgent(connectionId, body)

    override suspend fun deleteAgent(connectionId: String, agentId: AgentId) =
        agentSettingsApi.deleteAgent(connectionId, agentId)

    override suspend fun reloadConfig(connectionId: String) = agentSettingsApi.reloadConfig(connectionId)

    override suspend fun restartAgent(connectionId: String, agentId: AgentId) =
        acpAgentApi.restartAgent(connectionId, agentId)

    override suspend fun getAgentCapabilities(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) = acpAgentApi.getAgentCapabilities(connectionId, agentId, sessionId)

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ) = acpAgentApi.createSession(connectionId, body)

    override suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) = acpAgentApi.deleteSession(connectionId, agentId, sessionId)

    override suspend fun getAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ) = agentAuthApi.getAgentAuth(connectionId, agentId)

    override suspend fun logoutAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ) = agentAuthApi.logoutAgentAuth(connectionId, agentId)
}
