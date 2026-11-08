package harold.android.network

import harold.android.contracts.AgentId
import harold.android.contracts.PromptRequestBody
import kotlinx.serialization.json.JsonElement

/**
 * Command surface for the watched session: prompts and cancels go to the
 * active ACP session, permission and elicitation replies go to the session
 * that owns the pending request. Commands are independent of the event
 * stream — each call succeeds or fails on its own.
 */
interface SessionCommandApi {
    suspend fun prompt(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        body: PromptRequestBody,
    ): Result<Unit>

    suspend fun cancel(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit>

    suspend fun replyPermission(
        connectionId: String,
        requestId: String,
        optionId: String,
    ): Result<Unit>

    suspend fun replyExtension(
        connectionId: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit>

    /** Posts the raw ACP elicitation result. */
    suspend fun replyElicitation(
        connectionId: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> = Result.failure(
        UnsupportedOperationException("elicitation replies are not supported"),
    )
}
