package server.agent.android.operator

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

    override suspend fun promptSession(
        serverOrigin: String,
        sessionId: String,
        body: server.agent.android.contracts.PromptSessionBody,
    ) = agentApi.promptSession(serverOrigin, sessionId, body)

    override suspend fun updateSession(
        serverOrigin: String,
        sessionId: String,
        body: server.agent.android.contracts.UpdateSessionBody,
    ) = agentApi.updateSession(serverOrigin, sessionId, body)

    override suspend fun cancelSession(
        serverOrigin: String,
        sessionId: String,
    ) = agentApi.cancelSession(serverOrigin, sessionId)

    override suspend fun archiveSession(
        serverOrigin: String,
        sessionId: String,
    ) = agentApi.archiveSession(serverOrigin, sessionId)

    override suspend fun listPendingPermissions(
        serverOrigin: String,
        sessionId: String,
    ) = agentApi.listPendingPermissions(serverOrigin, sessionId).map { collection ->
        collection.items
    }

    override suspend fun resolvePermission(
        serverOrigin: String,
        sessionId: String,
        requestId: String,
        optionId: String,
    ) = agentApi.resolvePermission(
        serverOrigin = serverOrigin,
        sessionId = sessionId,
        requestId = requestId,
        body = server.agent.android.contracts.ResolvePermissionRequestBody(optionId = optionId),
    )
}
