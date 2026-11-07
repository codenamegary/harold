package harold.android.user

import harold.android.contracts.AgentId
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateWorkspaceBody
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
