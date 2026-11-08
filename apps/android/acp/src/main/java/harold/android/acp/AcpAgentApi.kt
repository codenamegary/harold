package harold.android.acp

import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.Session
import harold.android.contracts.SessionCollection
import harold.android.network.AcpAgentApi
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.AgentAuthCache
import harold.android.network.SessionCommandApi
import harold.android.network.SessionConfigApi
import harold.android.network.hostLoginInstructions
import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessLauncher
import harold.android.process.AgentProcessRestarter
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonElement

/** ACP session and command surface backed by live agent processes. */
@Singleton
class DefaultAcpAgentApi @Inject constructor(
    private val factory: AcpSessionFactory,
    private val registry: AcpSessionRegistry,
    private val authCache: AgentAuthCache,
    private val launcher: AgentProcessLauncher,
) : AcpAgentApi, SessionConfigApi, SessionCommandApi, AgentProcessRestarter {
    override suspend fun listSessions(
        connectionId: String,
        cwd: String?,
    ): Result<SessionCollection> = acpCall(connectionId) {
        val sessions = factory.listSessions(connectionId, cwd).getOrThrow()
        SessionCollection(
            items = sessions.map { session ->
                Session(
                    agentId = session.agentId,
                    sessionId = session.sessionId,
                    cwd = session.cwd,
                    title = session.title.orEmpty(),
                    updatedAt = session.updatedAt.orEmpty(),
                )
            },
        )
    }

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = acpCall(connectionId) {
        factory.createSession(
            connectionId = connectionId,
            agentId = body.agentId,
            cwd = body.cwd,
        ).getOrThrow()
    }

    override suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = acpCall(connectionId) {
        factory.deleteSession(connectionId, agentId, sessionId).getOrThrow()
    }

    override suspend fun restartAgent(connectionId: String, agentId: AgentId): Result<Unit> = acpCall(connectionId) {
        registry.all()
            .filter { it.connectionId == connectionId && it.agentId == agentId }
            .forEach { session ->
                runCatching { session.close() }
            }
        authCache.invalidate(connectionId, agentId)
    }

    override suspend fun getAgentCapabilities(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<AgentCapabilityInventory?> = Result.success(
        registry.find(connectionId, agentId, sessionId)?.capabilities,
    )

    override suspend fun prompt(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        body: PromptRequestBody,
    ): Result<Unit> = active(connectionId, agentId, sessionId) { session ->
        session.prompt(body)
    }

    override suspend fun cancel(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = active(connectionId, agentId, sessionId) { session ->
        session.cancel()
    }

    override suspend fun replyPermission(
        connectionId: String,
        requestId: String,
        optionId: String,
    ): Result<Unit> {
        val session = registry.all().firstOrNull { it.hasPermission(requestId) }
            ?: return Result.failure(
                AgentApiException(
                    AgentApiError.Problem(409, "Permission resolved", "This request is no longer active."),
                ),
            )
        return session.replyPermission(requestId, optionId)
    }

    override suspend fun replyExtension(
        connectionId: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> = unsupported("ACP extensions are not available over SSH.")

    override suspend fun replyElicitation(
        connectionId: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> {
        val session = registry.all().firstOrNull { it.hasElicitation(requestId) }
            ?: return Result.failure(
                AgentApiException(
                    AgentApiError.Problem(409, "Elicitation resolved", "This request is no longer active."),
                ),
            )
        return session.replyElicitation(requestId, result)
    }

    override suspend fun setConfigOption(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit> = active(connectionId, agentId, sessionId) { session ->
        session.setConfigOption(configId, value)
    }

    private suspend fun <T> active(
        connectionId: String,
        agentId: String,
        sessionId: String,
        block: suspend (AcpSession) -> Result<T>,
    ): Result<T> {
        val session = registry.find(connectionId, agentId, sessionId)
            ?: return Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 409,
                        title = "Session not connected",
                        detail = "Open this session again to start its agent process.",
                    ),
                ),
            )
        return block(session)
    }

    private suspend fun authRequiredDetail(connectionId: String, agentId: String): String {
        val displayName = runCatching {
            launcher.launchableAgents(connectionId).getOrNull()
                ?.firstOrNull { agent -> agent.id == agentId }
                ?.displayName
        }.getOrNull()
        return hostLoginInstructions(agentId, displayName)
    }

    private suspend fun <T> acpCall(
        connectionId: String,
        block: suspend () -> T,
    ): Result<T> =
        try {
            Result.success(block())
        } catch (error: AgentAuthRequiredException) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 401,
                        title = "Sign in on the host",
                        detail = authRequiredDetail(connectionId, error.agentId),
                    ),
                ),
            )
        } catch (error: AgentLaunchException) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 503,
                        title = "Agent failed to start",
                        detail = error.message,
                    ),
                ),
            )
        } catch (error: Throwable) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Transport(error),
                ),
            )
        }

    private fun <T> unsupported(message: String): Result<T> =
        Result.failure(
            AgentApiException(
                AgentApiError.Problem(
                    status = 501,
                    title = "Not available",
                    detail = message,
                ),
            ),
        )
}
