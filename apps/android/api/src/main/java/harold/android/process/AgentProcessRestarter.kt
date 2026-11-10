package harold.android.process

import harold.android.contracts.AgentId

/** Closes an agent's live ACP processes so its next session starts fresh. */
fun interface AgentProcessRestarter {
    suspend fun restartAgent(connectionId: String, agentId: AgentId): Result<Unit>
}
