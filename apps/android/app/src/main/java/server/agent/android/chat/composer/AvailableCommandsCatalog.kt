package server.agent.android.chat.composer

import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AvailableCommand
import server.agent.android.contracts.catalogSessionKey

/**
 * In-memory cache of slash commands each session has advertised. The hub
 * replays the latest list on subscribe. This keeps the last copy so a
 * session we already saw can show its picker before that replay arrives.
 */
class AvailableCommandsCatalog {
    private val byKey = linkedMapOf<String, List<AvailableCommand>>()

    fun remember(
        agentId: AgentId,
        sessionId: String,
        commands: List<AvailableCommand>,
    ) {
        if (sessionId.isEmpty()) {
            return
        }
        byKey[catalogSessionKey(agentId, sessionId)] = commands.toList()
    }

    fun forget(agentId: AgentId, sessionId: String) {
        byKey.remove(catalogSessionKey(agentId, sessionId))
    }

    fun clear() {
        byKey.clear()
    }

    fun current(agentId: AgentId?, sessionId: String?): List<AvailableCommand> {
        if (agentId == null || sessionId.isNullOrEmpty()) {
            return emptyList()
        }
        return byKey[catalogSessionKey(agentId, sessionId)].orEmpty()
    }
}
