package harold.android.chat.auth

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.toSummary
import harold.android.network.apiErrorMessage
import harold.android.user.UserRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The agent-auth slice the auth panel renders: the agent's auth state, its
 * summary, and the panel error. The view model mirrors it into
 * [harold.android.chat.ChatUiState.agentAuth], which is what the chat screen
 * reads.
 */
data class AgentAuthUiState(
    val agentAuth: AgentAuth? = null,
    val summary: AgentAuthSummary? = null,
    val error: String? = null,
) {
    /** The summary the auth panel renders: the resolved one, else one derived from the raw auth. */
    val authSummary: AgentAuthSummary?
        get() = summary ?: agentAuth?.toSummary(canLogout = false)

    val showAuthPanel: Boolean
        get() = when (authSummary?.status) {
            AgentAuthStatus.NeedsAuth,
            AgentAuthStatus.Error,
            -> true
            AgentAuthStatus.Unknown,
            AgentAuthStatus.Authenticated,
            null,
            -> false
        }
}

/**
 * Owns the agent-auth state for a session: hydrating the auth state when a
 * session opens, adopting auth pushed by the live stream, and caching
 * per-agent summaries so a session switch can seed the panel instantly.
 */
class AgentAuthController(
    private val userRepository: UserRepository,
    private val scope: CoroutineScope,
    private val origin: () -> String?,
    private val selectedAgent: () -> AgentId?,
) {
    private val _state = MutableStateFlow(AgentAuthUiState())
    val state: StateFlow<AgentAuthUiState> = _state.asStateFlow()

    /** Per-agent auth summaries; survives session switches so the panel seeds instantly. */
    private var summaries: Map<AgentId, AgentAuthSummary> = emptyMap()

    /** Bumped on every hydration; a stale response for a superseded hydrate is dropped. */
    private var hydrateGeneration = 0

    fun summary(agentId: AgentId): AgentAuthSummary? = summaries[agentId]

    /** Catalog refresh: fold fresh agent summaries into the cache. */
    fun mergeSummaries(added: Map<AgentId, AgentAuthSummary>) {
        summaries = summaries + added
    }

    /** Catalog refresh from scratch: the fresh list is the whole truth. */
    fun replaceSummaries(all: Map<AgentId, AgentAuthSummary>) {
        summaries = all
    }

    /**
     * Switched sessions: clear any stale auth, seeding the incoming agent's
     * cached summary. [agentId] null clears everything.
     */
    fun resetFor(agentId: AgentId?) {
        _state.update { AgentAuthUiState(summary = agentId?.let { summaries[it] }) }
    }

    /** Adopt auth pushed by the live stream; a null stream auth leaves the panel alone. */
    fun absorbStream(agentId: AgentId?, auth: AgentAuth?) {
        if (auth == null) {
            return
        }
        val summary = auth.toSummary(canLogout = false)
        if (agentId != null) {
            summaries = summaries + (agentId to summary)
        }
        _state.update { current -> current.copy(agentAuth = auth, summary = summary) }
    }

    /**
     * Signs the agent out through its host CLI, then re-probes. Fails into
     * the panel error when the agent has no logout.
     */
    fun logout(agentId: AgentId) {
        val serverOrigin = origin() ?: return
        _state.update { current -> current.copy(error = null) }
        scope.launch {
            userRepository.logoutAgentAuth(serverOrigin, agentId).fold(
                onSuccess = { summary ->
                    summaries = summaries + (agentId to summary)
                    _state.update { current ->
                        current.copy(agentAuth = null, summary = summary, error = null)
                    }
                },
                onFailure = { error ->
                    _state.update { current -> current.copy(error = apiErrorMessage(error)) }
                },
            )
        }
    }

    /**
     * Tears down the agent's live process; the next session spawns fresh and
     * the auth state is re-probed.
     */
    fun restart(agentId: AgentId) {
        val serverOrigin = origin() ?: return
        _state.update { current -> current.copy(error = null) }
        scope.launch {
            userRepository.restartAgent(serverOrigin, agentId).fold(
                onSuccess = {
                    hydrate(agentId)
                },
                onFailure = { error ->
                    _state.update { current -> current.copy(error = apiErrorMessage(error)) }
                },
            )
        }
    }

    suspend fun hydrate(agentId: AgentId) {
        val connectionId = origin() ?: return
        hydrateGeneration += 1
        val generation = hydrateGeneration
        userRepository.getAgentAuth(connectionId = connectionId, agentId = agentId).fold(
            onSuccess = { auth ->
                if (generation != hydrateGeneration || selectedAgent() != agentId) {
                    return
                }
                val summary = auth.toSummary(canLogout = false)
                summaries = summaries + (agentId to summary)
                _state.update { current ->
                    current.copy(agentAuth = auth, summary = summary, error = null)
                }
            },
            onFailure = { error ->
                if (generation != hydrateGeneration || selectedAgent() != agentId) {
                    return
                }
                _state.update { current -> current.copy(error = apiErrorMessage(error)) }
            },
        )
    }
}
