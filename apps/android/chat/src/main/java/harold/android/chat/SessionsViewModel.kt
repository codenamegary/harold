package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.database.session.SessionListItem
import harold.android.database.session.SessionRepository
import harold.android.foreground.SessionAttentionMarks
import harold.android.live.SessionOwner
import harold.android.navigation.Navigator
import harold.android.network.AgentSessionSnapshot
import harold.android.network.apiErrorMessage
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConnectionFilterChoice(
    val connectionId: String,
    val name: String,
    val colorId: String,
    val iconId: String,
)

data class SessionsUiState(
    val sessions: List<SessionRow> = emptyList(),
    val connections: List<ConnectionFilterChoice> = emptyList(),
    val connectionFilter: String? = null,
    val search: String = "",
    val loading: Boolean = true,
    val refreshingConnectionIds: Set<String> = emptySet(),
    val connectionErrors: Map<String, String> = emptyMap(),
    val error: String? = null,
)

@HiltViewModel
class SessionsViewModel @Inject constructor(
    private val connectionGateway: ConnectionGateway,
    private val sessionRepository: SessionRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
    private val sessionOwner: SessionOwner,
    private val connectionRepository: ConnectionRepository,
    private val sessionAttention: SessionAttentionMarks? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SessionsUiState())
    val uiState: StateFlow<SessionsUiState> = _uiState.asStateFlow()

    private var liveSessions: List<SessionListItem> = emptyList()
    private var catalog: List<SessionRow> = emptyList()
    private var savedConnections: List<ConnectionFilterChoice> = emptyList()
    private var savedByOrigin: Map<String, SavedConnection> = emptyMap()
    private val unreachableOrigins = mutableSetOf<String>()
    private val unreachableErrors = mutableMapOf<String, String>()
    private val refreshingOrigins = mutableSetOf<String>()
    private val workingOrigins = mutableSetOf<String>()
    private var pushedTitles: Map<String, String> = emptyMap()
    private var connectionFilter: String? = null
    private var agentSnapshots: List<AgentSessionSnapshot> = emptyList()

    init {
        viewModelScope.launch {
            sessionRepository.observeSessions().collect { sessions ->
                liveSessions = sessions
                rebuildCatalog()
            }
        }
        viewModelScope.launch {
            sessionRepository.observeSnapshots().collect { snapshots ->
                agentSnapshots = snapshots
                publishProgress()
                publish()
            }
        }
        viewModelScope.launch {
            load()
        }
        viewModelScope.launch {
            sessionOwner.sessionTitles.collect(::applyTitles)
        }
        sessionAttention?.let { marks ->
            viewModelScope.launch {
                marks.marked.collect { marked ->
                    catalog = catalog.map { row -> row.copy(needsAttention = marked.containsKey(row.id)) }
                    publish()
                }
            }
        }
    }

    fun onSearchChanged(query: String) {
        _uiState.update { current -> current.copy(search = query) }
        publish()
    }

    fun onConnectionFilter(connectionId: String?) {
        connectionFilter = connectionId
        publish()
    }

    fun reload() {
        viewModelScope.launch {
            load()
        }
    }

    fun select(row: SessionRow) {
        sessionCommands.emit(SessionCommand.Open(row))
        navigator.goBack()
    }

    fun delete(row: SessionRow) {
        val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
        val origin = row.connectionId.ifEmpty { active?.connectionId } ?: return

        viewModelScope.launch {
            sessionRepository.deleteSession(
                connectionId = origin,
                agentId = row.agentId,
                sessionId = row.sessionId,
            ).fold(
                onSuccess = {
                    liveSessions = liveSessions.filterNot { session ->
                        session.connectionId == origin &&
                            session.session.agentId == row.agentId &&
                            session.session.sessionId == row.sessionId
                    }
                    rebuildCatalog()
                    sessionCommands.emit(SessionCommand.Deleted(row))
                },
                onFailure = { error ->
                    _uiState.update { current -> current.copy(error = apiErrorMessage(error)) }
                },
            )
        }
    }

    private suspend fun load() {
        _uiState.update { current -> current.copy(loading = true, error = null) }

        val saved = connectionRepository.list()
        savedByOrigin = saved.associateBy { connection -> connection.connectionId }
        savedConnections = saved.map { connection ->
            ConnectionFilterChoice(
                connectionId = connection.connectionId,
                name = connection.name,
                colorId = connection.colorId,
                iconId = connection.iconId,
            )
        }

        val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
        val origins = saved.map { connection -> connection.connectionId }
            .ifEmpty { listOfNotNull(active?.connectionId) }

        refreshingOrigins.clear()
        refreshingOrigins.addAll(origins)
        publishProgress()

        var anySuccess = false
        var lastError: Throwable? = null
        origins.forEach { connectionId ->
            workingOrigins.add(connectionId)
            publishProgress()
            sessionRepository.refresh(connectionId).fold(
                onSuccess = {
                    anySuccess = true
                    unreachableOrigins.remove(connectionId)
                    unreachableErrors.remove(connectionId)
                },
                onFailure = { error ->
                    lastError = error
                    unreachableOrigins.add(connectionId)
                    unreachableErrors[connectionId] = apiErrorMessage(error)
                },
            )
            workingOrigins.remove(connectionId)
            refreshingOrigins.remove(connectionId)
            publishProgress()
        }

        val hasLiveRows = origins.isNotEmpty() && liveSessions.any { session -> session.connectionId in origins }
        val error = if (!anySuccess && !hasLiveRows) lastError else null

        _uiState.update { current ->
            current.copy(
                error = error?.let(::apiErrorMessage),
            )
        }
        publishProgress()
        rebuildCatalog()
    }

    private fun publishProgress() {
        val loadingAgents = agentSnapshots.filter { agent -> agent.loading }
        _uiState.update { current ->
            current.copy(
                loading = refreshingOrigins.isNotEmpty() || loadingAgents.isNotEmpty(),
                refreshingConnectionIds = workingOrigins + loadingAgents.map { agent -> agent.connectionId },
            )
        }
    }

    private fun rebuildCatalog() {
        val scopedToHarold = savedByOrigin.isNotEmpty()
        catalog = liveSessions.map { session ->
            val connection = savedByOrigin[session.connectionId]
            val row = session.toSessionRow().copy(
                connectionId = if (scopedToHarold) session.connectionId else "",
                connectionName = connection?.name.orEmpty(),
                connectionColorId = connection?.colorId.orEmpty(),
                connectionIconId = connection?.iconId.orEmpty(),
                connectionReachable = session.connectionId !in unreachableOrigins,
            )
            pushedTitles[row.id]?.let { title -> row.copy(name = title) } ?: row
        }
        publish()
    }

    private fun publish() {
        val search = _uiState.value.search.trim()
        val connections = savedConnections.ifEmpty {
            catalog
                .distinctBy { row -> row.connectionId }
                .filter { row -> row.connectionId.isNotEmpty() }
                .map { row ->
                    ConnectionFilterChoice(
                        connectionId = row.connectionId,
                        name = row.connectionName,
                        colorId = row.connectionColorId,
                        iconId = row.connectionIconId,
                    )
                }
        }
        val sessions = visibleSessionRows(catalog, connectionFilter)
            .filter { row -> search.isEmpty() || row.name.contains(search, ignoreCase = true) }
            .sortedByDescending { row -> row.updatedAt }
        val agentErrors = agentSnapshots
            .mapNotNull { snapshot -> snapshot.error?.let { message -> snapshot.connectionId to message } }
            .groupBy({ (connectionId, _) -> connectionId }, { (_, message) -> message })
            .mapValues { (_, messages) -> messages.distinct().joinToString(" ") }
        _uiState.update { current ->
            current.copy(
                sessions = sessions,
                connections = connections,
                connectionFilter = connectionFilter,
                connectionErrors = agentErrors + unreachableErrors,
            )
        }
    }

    private fun applyTitles(titles: Map<String, String>) {
        if (titles.isEmpty()) {
            return
        }
        pushedTitles = pushedTitles + titles
        rebuildCatalog()
    }
}
