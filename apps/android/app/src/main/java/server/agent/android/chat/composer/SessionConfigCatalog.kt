package server.agent.android.chat.composer

import server.agent.android.contracts.AgentId
import server.agent.android.contracts.ConfigOption
import server.agent.android.contracts.catalogSessionKey

/**
 * In-memory cache of the config options each session has advertised. The hub
 * delivers `session_config` once per subscribe, so this keeps the last copy
 * for a session we already saw, letting a watch restore the selectors before
 * the fresh frame arrives.
 */
class SessionConfigCatalog {
    private val byKey = linkedMapOf<String, List<ConfigOption>>()

    fun remember(
        agentId: AgentId,
        sessionId: String,
        options: List<ConfigOption>,
    ) {
        if (sessionId.isEmpty()) {
            return
        }
        byKey[catalogSessionKey(agentId, sessionId)] = options.toList()
    }

    fun forget(agentId: AgentId, sessionId: String) {
        byKey.remove(catalogSessionKey(agentId, sessionId))
    }

    fun clear() {
        byKey.clear()
    }

    fun current(agentId: AgentId?, sessionId: String?): List<ConfigOption> {
        if (agentId == null || sessionId.isNullOrEmpty()) {
            return emptyList()
        }
        return byKey[catalogSessionKey(agentId, sessionId)].orEmpty()
    }
}
