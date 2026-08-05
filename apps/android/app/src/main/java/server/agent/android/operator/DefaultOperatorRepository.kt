package server.agent.android.operator

import server.agent.android.contracts.CreateSessionBody
import server.agent.android.network.AgentApi

class DefaultOperatorRepository(
    private val agentApi: AgentApi,
) : OperatorRepository {
    override suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int,
    ) = agentApi.listWorkspaces(serverOrigin, limit)

    override suspend fun listSessions(
        serverOrigin: String,
        workspaceId: String?,
        limit: Int,
    ) = agentApi.listSessions(serverOrigin, workspaceId, limit)

    override suspend fun listAgents(serverOrigin: String) = agentApi.listAgents(serverOrigin)

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ) = agentApi.createSession(serverOrigin, body)

    override suspend fun selectSession(
        serverOrigin: String,
        sessionId: String,
    ) = agentApi.selectSession(serverOrigin, sessionId)
}
