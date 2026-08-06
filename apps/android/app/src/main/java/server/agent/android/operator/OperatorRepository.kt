package server.agent.android.operator

import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionCollection
import server.agent.android.contracts.WorkspaceCollection

interface OperatorRepository {
    suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int = 100,
    ): Result<WorkspaceCollection>

    suspend fun listSessions(
        serverOrigin: String,
        workspaceId: String? = null,
        limit: Int = 100,
    ): Result<SessionCollection>

    suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection>

    suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse>

    suspend fun selectSession(
        serverOrigin: String,
        sessionId: String,
    ): Result<Session>

    suspend fun promptSession(
        serverOrigin: String,
        sessionId: String,
        body: server.agent.android.contracts.PromptSessionBody,
    ): Result<server.agent.android.contracts.PromptSessionResponse>
}
