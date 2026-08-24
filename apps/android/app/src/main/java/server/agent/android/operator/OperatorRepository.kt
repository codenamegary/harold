package server.agent.android.operator

import server.agent.android.contracts.AgentAuth
import server.agent.android.contracts.AgentAuthSession
import server.agent.android.contracts.AgentAuthSummary
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AgentSettingsCollection
import server.agent.android.contracts.AuthSessionAction
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateSessionResponse
import server.agent.android.contracts.CreateWorkspaceBody
import server.agent.android.contracts.FilesystemDirectoryCollection
import server.agent.android.contracts.RuntimeSettingsView
import server.agent.android.contracts.SessionCollection
import server.agent.android.contracts.Workspace
import server.agent.android.contracts.WorkspaceCollection

interface OperatorRepository {
    suspend fun listWorkspaces(
        serverOrigin: String,
        limit: Int = 100,
    ): Result<WorkspaceCollection>

    suspend fun getRuntimeSettings(serverOrigin: String): Result<RuntimeSettingsView>

    suspend fun listFilesystemDirectories(
        serverOrigin: String,
        root: String,
    ): Result<FilesystemDirectoryCollection>

    suspend fun createWorkspace(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace>

    suspend fun listSessions(
        serverOrigin: String,
        cwd: String? = null,
    ): Result<SessionCollection>

    suspend fun listAgents(serverOrigin: String): Result<AgentSettingsCollection>

    suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse>

    suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit>

    suspend fun getAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuth>

    suspend fun startAgentAuthSession(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSession>

    suspend fun applyAgentAuthSessionAction(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
        action: AuthSessionAction,
    ): Result<AgentAuthSession>

    suspend fun logoutAgentAuth(
        serverOrigin: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary>

    suspend fun revokeDevice(
        serverOrigin: String,
        deviceId: String,
    ): Result<Unit>
}
