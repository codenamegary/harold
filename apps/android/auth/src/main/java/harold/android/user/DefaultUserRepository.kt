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
        serverOrigin: String,
        limit: Int,
    ) = agentApi.listWorkspaces(serverOrigin, limit)

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String?,
    ) = agentApi.listFilesystemDirectories(serverOrigin, root)

    override suspend fun createFilesystemDirectory(
        serverOrigin: String,
        body: CreateFilesystemDirectoryBody,
    ) = agentApi.createFilesystemDirectory(serverOrigin, body)

    override suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ) = agentApi.createWorkspace(serverOrigin, body)

    override suspend fun listSessions(
        serverOrigin: String,
        cwd: String?,
    ) = agentApi.listSessions(serverOrigin, cwd)

    override suspend fun listAgents(serverOrigin: String) = agentApi.listAgents(serverOrigin)

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ) = agentApi.createSession(serverOrigin, body)

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ) = agentApi.deleteSession(serverOrigin, agentId, sessionId)

    override suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ) = agentApi.getAgentAuth(serverOrigin, agentId)

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ) = agentApi.logoutAgentAuth(serverOrigin, agentId)
}
