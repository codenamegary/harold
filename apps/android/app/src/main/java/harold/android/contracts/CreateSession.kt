package harold.android.contracts

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class CreateSessionBody(
    val agentId: AgentId,
    val cwd: String,
)

/**
 * The 201 response from `POST /v1/sessions`: the created ACP session plus the
 * agent's config options at creation time. Later config changes arrive on the
 * session stream as `session_config` frames.
 */
@Serializable
data class CreateSessionResponse(
    val agentId: AgentId,
    val sessionId: String,
    val cwd: String,
    val title: String,
    val updatedAt: String,
    val configOptions: List<JsonElement>,
) {
    fun toSession(): Session = Session(
        agentId = agentId,
        sessionId = sessionId,
        cwd = cwd,
        title = title,
        updatedAt = updatedAt,
    )
}
