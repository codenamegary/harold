package harold.android.chat.auth

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.toSummary
import harold.android.network.apiErrorMessage
import harold.android.user.UserRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The agent-auth slice the auth panel renders: the agent's auth state, its
 * summary, and the transient panel flags. The chat screen reads this slice
 * directly.
 */
data class AgentAuthUiState(
    val agentAuth: AgentAuth? = null,
    val summary: AgentAuthSummary? = null,
    val panelSubmitting: Boolean = false,
    val actionBusy: Boolean = false,
    val error: String? = null,
) {
    /** The summary the auth panel acts on: the resolved one, else one derived from the raw auth. */
    val authSummary: AgentAuthSummary?
        get() = summary ?: agentAuth?.toSummary(canLogout = false)

    val showAuthPanel: Boolean
        get() {
            val sessionInFlight = agentAuth?.session?.status == AuthSessionStatus.InProgress
            if (sessionInFlight) {
                return true
            }
            return when (authSummary?.status) {
                AgentAuthStatus.NeedsAuth,
                AgentAuthStatus.Error,
                -> true
                AgentAuthStatus.Unknown,
                AgentAuthStatus.Authenticated,
                null,
                -> false
            }
        }
}

/**
 * Owns the agent-auth conversation with a Harold: hydrating the auth state
 * when a session opens, driving the sign-in / confirm / cancel / logout
 * actions, adopting auth pushed by the live stream, and caching per-agent
 * summaries so a session switch can seed the panel instantly.
 */
class AgentAuthController(
    private val userRepository: UserRepository,
    private val scope: CoroutineScope,
    private val origin: () -> String?,
    private val selectedAgent: () -> AgentId?,
    private val onAuthenticated: (AgentId, AgentAuthStatus) -> Unit = { _, _ -> },
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
     * Switched sessions: clear the panel flags and any stale auth, seeding
     * the incoming agent's cached summary. [agentId] null clears everything.
     */
    fun resetFor(agentId: AgentId?) {
        _state.value = AgentAuthUiState(summary = agentId?.let { summaries[it] })
    }

    /** Adopt auth pushed by the live stream; a null stream auth leaves the panel alone. */
    fun absorbStream(agentId: AgentId?, auth: AgentAuth?) {
        if (auth == null) {
            return
        }
        val canLogout = agentId?.let { summaries[it]?.canLogout } ?: false
        val summary = auth.toSummary(canLogout = canLogout)
        if (agentId != null) {
            summaries = summaries + (agentId to summary)
        }
        _state.value = _state.value.copy(agentAuth = auth, summary = summary)
    }

    suspend fun hydrate(agentId: AgentId, autoStartLogin: Boolean = false) {
        val serverOrigin = origin() ?: return
        hydrateGeneration += 1
        val generation = hydrateGeneration
        userRepository.getAgentAuth(serverOrigin = serverOrigin, agentId = agentId).fold(
            onSuccess = { auth ->
                if (generation != hydrateGeneration || selectedAgent() != agentId) {
                    return
                }
                val canLogout = summaries[agentId]?.canLogout ?: false
                val summary = auth.toSummary(canLogout = canLogout)
                summaries = summaries + (agentId to summary)
                _state.value = _state.value.copy(agentAuth = auth, summary = summary, error = null)
                if (
                    autoStartLogin &&
                    auth.session?.status != AuthSessionStatus.InProgress &&
                    auth.status == AgentAuthStatus.NeedsAuth
                ) {
                    signIn(agentId)
                }
                onAuthenticated(agentId, auth.status)
            },
            onFailure = { error ->
                if (generation != hydrateGeneration || selectedAgent() != agentId) {
                    return
                }
                _state.value = _state.value.copy(error = apiErrorMessage(error))
            },
        )
    }

    fun signIn(agentId: AgentId) {
        val current = _state.value
        if (current.panelSubmitting || current.actionBusy) {
            return
        }
        val serverOrigin = origin() ?: return
        _state.value = current.copy(panelSubmitting = true, error = null)
        scope.launch {
            userRepository.startAgentAuthSession(
                serverOrigin = serverOrigin,
                agentId = agentId,
            ).fold(
                onSuccess = { session -> applySessionResult(agentId, session) },
                onFailure = { error ->
                    _state.value = _state.value.copy(
                        panelSubmitting = false,
                        error = apiErrorMessage(error),
                    )
                },
            )
        }
    }

    fun confirm(agentId: AgentId, authSessionId: String, stepId: String) {
        beginAction()?.let { serverOrigin ->
            launchAction(
                serverOrigin = serverOrigin,
                agentId = agentId,
                authSessionId = authSessionId,
                action = AuthSessionAction.Confirm(stepId = stepId),
            )
        }
    }

    fun cancel(agentId: AgentId, authSessionId: String) {
        beginAction()?.let { serverOrigin ->
            launchAction(
                serverOrigin = serverOrigin,
                agentId = agentId,
                authSessionId = authSessionId,
                action = AuthSessionAction.Cancel,
                thenRehydrate = true,
            )
        }
    }

    fun logout(agentId: AgentId) {
        val current = _state.value
        if (current.authSummary?.canLogout != true) {
            return
        }
        if (current.actionBusy || current.panelSubmitting) {
            return
        }
        if (current.agentAuth?.session?.status == AuthSessionStatus.InProgress) {
            return
        }
        val serverOrigin = origin() ?: return
        _state.value = current.copy(actionBusy = true, error = null)
        scope.launch {
            userRepository.logoutAgentAuth(serverOrigin = serverOrigin, agentId = agentId).fold(
                onSuccess = { logoutSummary ->
                    summaries = summaries + (agentId to logoutSummary)
                    _state.value = _state.value.copy(
                        agentAuth = AgentAuth(
                            agentId = agentId,
                            status = logoutSummary.status,
                            error = logoutSummary.error,
                            session = null,
                        ),
                        summary = logoutSummary,
                        actionBusy = false,
                        error = null,
                    )
                },
                onFailure = { error -> endAction(error) },
            )
        }
    }

    /** The panel is idle only when neither transient flag is up. */
    private fun busy(): Boolean = _state.value.panelSubmitting || _state.value.actionBusy

    private fun beginAction(): String? {
        if (busy()) {
            return null
        }
        return origin() ?: return null
    }

    private fun launchAction(
        serverOrigin: String,
        agentId: AgentId,
        authSessionId: String,
        action: AuthSessionAction,
        thenRehydrate: Boolean = false,
    ) {
        _state.value = _state.value.copy(actionBusy = true, error = null)
        scope.launch {
            userRepository.applyAgentAuthSessionAction(
                serverOrigin = serverOrigin,
                agentId = agentId,
                sessionId = authSessionId,
                action = action,
            ).fold(
                onSuccess = { session ->
                    applySessionResult(agentId, session)
                    if (thenRehydrate) {
                        hydrate(agentId)
                    }
                },
                onFailure = { error -> endAction(error) },
            )
        }
    }

    private fun endAction(error: Throwable) {
        _state.value = _state.value.copy(actionBusy = false, error = apiErrorMessage(error))
    }

    /**
     * A sign-in, confirm, or cancel produced a fresh session: map it onto the
     * panel, cache the summary, and let the host react to a login that may
     * unblock work (the pending-session flow).
     */
    private fun applySessionResult(agentId: AgentId, session: AgentAuthSession) {
        val canLogout = summaries[agentId]?.canLogout ?: false
        val auth = AgentAuth(
            agentId = agentId,
            status = when (session.status) {
                AuthSessionStatus.Succeeded -> AgentAuthStatus.Authenticated
                AuthSessionStatus.Failed -> AgentAuthStatus.Error
                AuthSessionStatus.Cancelled,
                AuthSessionStatus.InProgress,
                -> AgentAuthStatus.NeedsAuth
            },
            error = session.error,
            session = session,
        )
        val summary = auth.toSummary(canLogout = canLogout)
        summaries = summaries + (agentId to summary)
        if (selectedAgent() != agentId) {
            return
        }
        _state.value = _state.value.copy(
            agentAuth = auth,
            summary = summary,
            panelSubmitting = false,
            actionBusy = false,
            error = null,
        )
        onAuthenticated(agentId, auth.status)
    }
}
