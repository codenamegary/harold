package harold.android.network

/**
 * What happened to a prompt at the transport boundary.
 *
 * [Accepted] means the bytes reached the agent; the turn itself settles
 * asynchronously. [Retryable] failed before any remote work could start.
 * [Interrupted] may have reached the agent and must never be replayed
 * automatically.
 */
sealed interface PromptResult {
    /** The prompt was written to the agent. */
    data object Accepted : PromptResult

    /** The prompt failed before remote work started. Safe to retry. */
    data object Retryable : PromptResult

    /** The prompt may have reached the agent; never auto-replay it. */
    data object Interrupted : PromptResult

    /** The agent rejected the prompt or failed the turn. */
    data class Failed(val message: String) : PromptResult
}
