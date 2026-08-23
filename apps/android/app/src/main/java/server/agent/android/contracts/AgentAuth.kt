package server.agent.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class AgentAuthStatus {
    @SerialName("unknown")
    Unknown,

    @SerialName("needs_auth")
    NeedsAuth,

    @SerialName("authenticated")
    Authenticated,

    @SerialName("error")
    Error,
}

@Serializable
data class AgentAuthSummary(
    val status: AgentAuthStatus,
    val error: String?,
    val activeSessionId: String?,
    val canLogout: Boolean,
)

@Serializable
enum class AuthSessionStatus {
    @SerialName("in_progress")
    InProgress,

    @SerialName("succeeded")
    Succeeded,

    @SerialName("failed")
    Failed,

    @SerialName("cancelled")
    Cancelled,
}

@Serializable
enum class AuthShowMessageLevel {
    @SerialName("info")
    Info,

    @SerialName("error")
    Error,
}

@Serializable
enum class AuthDoneOutcome {
    @SerialName("succeeded")
    Succeeded,

    @SerialName("failed")
    Failed,

    @SerialName("cancelled")
    Cancelled,
}

@Serializable
sealed interface AuthStep {
    @Serializable
    @SerialName("show_message")
    data class ShowMessage(
        val level: AuthShowMessageLevel,
        val body: String,
    ) : AuthStep

    @Serializable
    @SerialName("confirm")
    data class Confirm(
        val stepId: String,
        val title: String,
        val body: String,
        val confirmLabel: String,
    ) : AuthStep

    @Serializable
    @SerialName("working")
    data class Working(
        val label: String,
    ) : AuthStep

    @Serializable
    @SerialName("done")
    data class Done(
        val outcome: AuthDoneOutcome,
        val message: String?,
    ) : AuthStep
}

@Serializable
sealed interface AuthSessionAction {
    @Serializable
    @SerialName("confirm")
    data class Confirm(
        val stepId: String,
    ) : AuthSessionAction

    @Serializable
    @SerialName("cancel")
    data object Cancel : AuthSessionAction
}

@Serializable
data class AgentAuthSession(
    val sessionId: String,
    val agentId: AgentId,
    val status: AuthSessionStatus,
    val steps: List<AuthStep> = emptyList(),
    val error: String?,
)

@Serializable
data class AgentAuth(
    val agentId: AgentId,
    val status: AgentAuthStatus,
    val error: String?,
    val session: AgentAuthSession?,
)

fun AgentAuth.toSummary(canLogout: Boolean): AgentAuthSummary = AgentAuthSummary(
    status = status,
    error = error,
    activeSessionId = session
        ?.takeIf { it.status == AuthSessionStatus.InProgress }
        ?.sessionId,
    canLogout = canLogout,
)
