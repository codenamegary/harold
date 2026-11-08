package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.database.session.CachedSession
import harold.android.database.session.SessionRepository
import harold.android.foreground.SessionAttentionMarks
import harold.android.live.SessionOwner
import harold.android.navigation.Navigator
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

    private var cached: List<CachedSession> = emptyList()
    private var catalog: List<SessionRow> = emptyList()
    private var savedConnections: List<ConnectionFilterChoice> = emptyList()
    private var savedByOrigin: Map<String, SavedConnection> = emptyMap()
    private val unreachableOrigins = mutableSetOf<String>()
    private var pushedTitles: Map<String, String> = emptyMap()
    private var connectionFilter: String? = null

    init {
        viewModelScope.launch {
            sessionRepository.observeSessions().collect { sessions ->
                cached = sessions
                rebuildCatalog()
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
                    cached = cached.filterNot { session ->
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

        var anySuccess = false
        var lastError: Throwable? = null
        origins.forEach { connectionId ->
            sessionRepository.refresh(connectionId).fold(
                onSuccess = {
                    anySuccess = true
                    unreachableOrigins.remove(connectionId)
                },
                onFailure = { error ->
                    lastError = error
                    unreachableOrigins.add(connectionId)
                },
            )
        }

        val hasCache = origins.isNotEmpty() && cached.any { session -> session.connectionId in origins }
        val error = if (!anySuccess && !hasCache) lastError else null

        _uiState.update { current ->
            current.copy(
                loading = false,
                error = error?.let(::apiErrorMessage),
            )
        }
        rebuildCatalog()
    }

    private fun rebuildCatalog() {
        val scopedToHarold = savedByOrigin.isNotEmpty()
        catalog = cached.map { session ->
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
        _uiState.update { current ->
            current.copy(
                sessions = sessions,
                connections = connections,
                connectionFilter = connectionFilter,
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
