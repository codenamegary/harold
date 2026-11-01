package harold.android.chat

import harold.android.contracts.AgentId
import harold.android.navigation.LastSessionSelection
import harold.android.navigation.SessionPreferences
import kotlinx.coroutines.CompletableDeferred

class FakeSessionPreferences(
    var selection: LastSessionSelection? = null,
) : SessionPreferences {
    private val models = mutableMapOf<String, String>()
    val savedSelections = mutableListOf<LastSessionSelection>()
    val savedModels = mutableListOf<Triple<String, String, String>>()
    var loadModelGate: CompletableDeferred<Unit>? = null

    fun seedModel(serverOrigin: String, agentId: AgentId, model: String) {
        models[modelKey(serverOrigin, agentId)] = model
    }

    fun model(serverOrigin: String, agentId: AgentId): String? =
        models[modelKey(serverOrigin, agentId)]

    override suspend fun loadLastSessionSelection(): LastSessionSelection? = selection

    override suspend fun saveLastSessionSelection(selection: LastSessionSelection) {
        this.selection = selection
        savedSelections += selection
    }

    override suspend fun loadLastModel(serverOrigin: String, agentId: AgentId): String? {
        loadModelGate?.await()
        return models[modelKey(serverOrigin, agentId)]
    }

    override suspend fun saveLastModel(serverOrigin: String, agentId: AgentId, model: String) {
        models[modelKey(serverOrigin, agentId)] = model
        savedModels += Triple(serverOrigin, agentId, model)
    }

    private fun modelKey(serverOrigin: String, agentId: AgentId): String =
        "$serverOrigin|$agentId"
}
