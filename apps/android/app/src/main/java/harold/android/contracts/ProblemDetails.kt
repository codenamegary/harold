package harold.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

object ProblemTypes {
    const val VALIDATION_ERROR = "https://harold.local/problems/validation-error"
    const val INTERNAL_ERROR = "https://harold.local/problems/internal-error"
    const val NOT_FOUND = "https://harold.local/problems/not-found"
    const val CONFLICT = "https://harold.local/problems/conflict"
    const val UNAUTHORIZED = "https://harold.local/problems/unauthorized"
    const val WORKSPACE_ACTIVE_SESSIONS =
        "https://harold.local/problems/workspace-has-active-sessions"
    const val ALLOWED_ROOT_HAS_WORKSPACES =
        "https://harold.local/problems/allowed-root-has-workspaces"
}

@Serializable
data class ProblemError(
    val pointer: String,
    val code: String,
)

@Serializable
sealed class ProblemDetails {
    abstract val title: String
    abstract val status: Int?
    abstract val instance: String?
}

@Serializable
@SerialName(ProblemTypes.VALIDATION_ERROR)
data class ValidationProblem(
    override val title: String,
    override val status: Int? = null,
    override val instance: String? = null,
    val code: String,
    val errors: List<ProblemError>,
) : ProblemDetails()

@Serializable
@SerialName(ProblemTypes.INTERNAL_ERROR)
data class InternalProblem(
    override val title: String,
    override val status: Int? = null,
    override val instance: String? = null,
    val detail: String? = null,
) : ProblemDetails()

@Serializable
@SerialName(ProblemTypes.NOT_FOUND)
data class NotFoundProblem(
    override val title: String,
    override val status: Int? = null,
    override val instance: String? = null,
    val detail: String? = null,
) : ProblemDetails()

@Serializable
@SerialName(ProblemTypes.CONFLICT)
data class ConflictProblem(
    override val title: String,
    override val status: Int? = null,
    override val instance: String? = null,
    val detail: String? = null,
) : ProblemDetails()

@Serializable
@SerialName(ProblemTypes.UNAUTHORIZED)
data class UnauthorizedProblem(
    override val title: String,
    override val status: Int? = null,
    override val instance: String? = null,
    val detail: String? = null,
) : ProblemDetails()

@Serializable
@SerialName(ProblemTypes.WORKSPACE_ACTIVE_SESSIONS)
data class WorkspaceActiveSessionsProblem(
    override val title: String,
    override val status: Int? = null,
    override val instance: String? = null,
    val detail: String? = null,
    val forceDeleteAvailable: Boolean,
) : ProblemDetails()

@Serializable
@SerialName(ProblemTypes.ALLOWED_ROOT_HAS_WORKSPACES)
data class AllowedRootHasWorkspacesProblem(
    override val title: String,
    override val status: Int? = null,
    override val instance: String? = null,
    val detail: String? = null,
    val forceDeleteAvailable: Boolean,
) : ProblemDetails()
