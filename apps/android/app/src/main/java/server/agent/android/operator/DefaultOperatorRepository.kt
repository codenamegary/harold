package server.agent.android.operator

import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AuthSessionAction
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateWorkspaceBody
import server.agent.android.network.AgentApi

class DefaultOperatorRepository(
    private val agentApi: AgentApi,
) : OperatorRepository {
    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ) = agentApi.listWorkspaces(serverOrigin, limit)

    override suspend fun getRuntimeSettings(serverOrigin: String) =
        agentApi.getRuntimeSettings(serverOrigin)

    override suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ) = agentApi.listFilesystemDirectories(serverOrigin, root)

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

    override suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: AgentId,
    ) = agentApi.startAgentAuthSession(serverOrigin, agentId)

    override suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: AuthSessionAction,
    ) = agentApi.applyAgentAuthSessionAction(serverOrigin, agentId, sessionId, action)

    override suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ) = agentApi.logoutAgentAuth(serverOrigin, agentId)

    override suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ) = agentApi.revokeDevice(serverOrigin, deviceId)
}
