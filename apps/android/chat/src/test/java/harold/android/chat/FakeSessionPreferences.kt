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

    fun seedModel(connectionId: String, agentId: AgentId, model: String) {
        models[modelKey(connectionId, agentId)] = model
    }

    fun model(connectionId: String, agentId: AgentId): String? =
        models[modelKey(connectionId, agentId)]

    override suspend fun loadLastSessionSelection(): LastSessionSelection? = selection

    override suspend fun saveLastSessionSelection(selection: LastSessionSelection) {
        this.selection = selection
        savedSelections += selection
    }

    override suspend fun loadLastModel(connectionId: String, agentId: AgentId): String? {
        loadModelGate?.await()
        return models[modelKey(connectionId, agentId)]
    }

    override suspend fun saveLastModel(connectionId: String, agentId: AgentId, model: String) {
        models[modelKey(connectionId, agentId)] = model
        savedModels += Triple(connectionId, agentId, model)
    }

    private fun modelKey(connectionId: String, agentId: AgentId): String =
        "$connectionId|$agentId"
}
