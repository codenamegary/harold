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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.serialization.json.JsonElement

/** ACP session and command surface backed by the shared agent runtime. */
@Singleton
class DefaultAcpAgentApi @Inject constructor(
    private val runtime: AgentRuntime,
    private val authCache: AgentAuthCache,
    private val launcher: AgentProcessLauncher,
) : AcpAgentApi, SessionConfigApi, SessionCommandApi, AgentProcessRestarter {
    override suspend fun listSessions(
        connectionId: String,
        cwd: String?,
    ): Result<SessionCollection> = acpCall(connectionId) {
        val sessions = runtime.listSessions(connectionId, cwd).getOrThrow()
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
        runtime.createSession(
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
        runtime.deleteSession(connectionId, agentId, sessionId).getOrThrow()
    }

    override suspend fun restartAgent(
        connectionId: String,
        agentId: AgentId,
    ): Result<Unit> = acpCall(connectionId) {
        runtime.restart(connectionId, agentId).getOrThrow()
        authCache.invalidate(connectionId, agentId)
    }

    override suspend fun getAgentCapabilities(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<AgentCapabilityInventory?> = Result.success(
        runtime.capabilities(connectionId, agentId, sessionId),
    )

    override suspend fun prompt(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        body: PromptRequestBody,
    ): Result<Unit> = acpCall(connectionId) {
        sessionFor(connectionId, agentId, sessionId).prompt(body).getOrThrow()
    }

    override suspend fun cancel(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = acpCall(connectionId) {
        sessionFor(connectionId, agentId, sessionId).cancel().getOrThrow()
    }

    override suspend fun replyPermission(
        connectionId: String,
        requestId: String,
        optionId: String,
    ): Result<Unit> {
        val session = runtime.findSessionByRequest(requestId)
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
        val session = runtime.findSessionByRequest(requestId)
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
    ): Result<Unit> = acpCall(connectionId) {
        sessionFor(connectionId, agentId, sessionId)
            .setConfigOption(configId, value)
            .getOrThrow()
    }

    /**
     * Commands attach to the live session when one exists, otherwise they
     * reopen it through the runtime. A warm process makes that cheap; a cold
     * one performs `session/load` on attach.
     */
    private suspend fun sessionFor(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): AcpSession =
        runtime.findSession(connectionId, agentId, sessionId)
            ?: runtime.openSession(connectionId, agentId, sessionId).getOrThrow()

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
        } catch (error: TimeoutCancellationException) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Unavailable("The agent did not respond in time. Try again."),
                ),
            )
        } catch (error: CancellationException) {
            throw error
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
                    AgentApiError.Unavailable(unavailableDetail(error)),
                ),
            )
        }

    /**
     * A semantic, user-safe message. Raw causes and stack traces never reach
     * the chat surface.
     */
    private fun unavailableDetail(error: Throwable): String = when (error) {
        is AcpClosedException -> "The agent connection closed. Try again."
        is AcpRemoteException -> error.message
            ?.takeIf { message -> message.isNotBlank() }
            ?: "The agent rejected the request."
        is IllegalStateException -> error.message
            ?.takeIf { message -> message.isNotBlank() }
            ?: "The agent is unavailable. Try again."
        else -> {
            val message = error.message.orEmpty()
            if (
                message.contains("does not support") ||
                message.contains("did not return this session")
            ) {
                message
            } else {
                "The agent is unavailable. Try again."
            }
        }
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
