package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.SavedHaroldRepository
import harold.android.live.SessionOwner
import harold.android.navigation.Navigator
import harold.android.network.apiErrorMessage
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HaroldFilterChoice(
    val serverOrigin: String,
    val name: String,
    val colorId: String,
    val iconId: String,
)

data class SessionsUiState(
    val sessions: List<SessionRow> = emptyList(),
    val harolds: List<HaroldFilterChoice> = emptyList(),
    val haroldFilter: String? = null,
    val search: String = "",
    val loading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class SessionsViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val userRepository: UserRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
    private val sessionOwner: SessionOwner,
    private val savedHaroldRepository: SavedHaroldRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SessionsUiState())
    val uiState: StateFlow<SessionsUiState> = _uiState.asStateFlow()

    private var catalog: List<SessionRow> = emptyList()
    private val retainedByOrigin = mutableMapOf<String, List<SessionRow>>()
    private var haroldFilter: String? = null

    init {
        viewModelScope.launch {
            load()
        }
        viewModelScope.launch {
            sessionOwner.sessionTitles.collect(::applyTitles)
        }
    }

    fun onSearchChanged(query: String) {
        _uiState.update { current -> current.copy(search = query) }
        publish()
    }

    fun onHaroldFilter(serverOrigin: String?) {
        haroldFilter = serverOrigin
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
        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        val origin = row.serverOrigin.ifEmpty { paired?.serverOrigin } ?: return

        viewModelScope.launch {
            userRepository.deleteSession(
                serverOrigin = origin,
                agentId = row.agentId,
                sessionId = row.sessionId,
            ).fold(
                onSuccess = {
                    catalog = catalog.filterNot { item -> item.id == row.id }
                    retainedByOrigin[origin] = retainedByOrigin[origin]
                        .orEmpty()
                        .filterNot { item -> item.id == row.id }
                    publish()
                    sessionCommands.emit(SessionCommand.Deleted(row))
                },
                onFailure = { error ->
                    _uiState.update { current -> current.copy(error = apiErrorMessage(error)) }
                },
            )
        }
    }

    private suspend fun load() {
        val saved = savedHaroldRepository.list()
        if (saved.isEmpty()) {
            loadPairedHarold()
            return
        }

        saved.forEach { harold ->
            val workspaceByPath = userRepository.listWorkspaces(harold.serverOrigin)
                .getOrNull()
                ?.items
                .orEmpty()
                .map { workspace -> workspace.toWorkspaceRow() }
                .associateBy { workspace -> workspace.path }
            val agentLabels = userRepository.listAgents(harold.serverOrigin)
                .getOrNull()
                ?.items
                .orEmpty()
                .associate { agent -> agent.id to agent.displayName }
            val sessionsResult = userRepository.listSessions(harold.serverOrigin)
            if (sessionsResult.isSuccess) {
                retainedByOrigin[harold.serverOrigin] = mergedSessionRows(
                    listOf(
                        HaroldSessionGroup(
                            serverOrigin = harold.serverOrigin,
                            haroldName = harold.name,
                            colorId = harold.colorId,
                            iconId = harold.iconId,
                            reachable = true,
                            sessions = sessionsResult.getOrThrow().items.map { session ->
                                session.toSessionRow(workspaceByPath, agentLabels)
                            },
                        ),
                    ),
                )
            } else {
                retainedByOrigin[harold.serverOrigin] = retainedByOrigin[harold.serverOrigin]
                    .orEmpty()
                    .map { row ->
                        row.copy(
                            haroldName = harold.name,
                            haroldColorId = harold.colorId,
                            haroldIconId = harold.iconId,
                            haroldReachable = false,
                        )
                    }
            }
        }
        val known = saved.map { harold -> harold.serverOrigin }.toSet()
        retainedByOrigin.keys.retainAll(known)
        catalog = retainedByOrigin.values.flatten().sortedByDescending { row -> row.updatedAt }
        publish()
        _uiState.update { current -> current.copy(loading = false, error = null) }
    }

    private suspend fun loadPairedHarold() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        if (paired == null) {
            _uiState.update { current -> current.copy(loading = false) }
            return
        }

        val workspaceByPath = userRepository.listWorkspaces(paired.serverOrigin)
            .getOrNull()
            ?.items
            .orEmpty()
            .map { workspace -> workspace.toWorkspaceRow() }
            .associateBy { workspace -> workspace.path }
        val agentLabels = userRepository.listAgents(paired.serverOrigin)
            .getOrNull()
            ?.items
            .orEmpty()
            .associate { agent -> agent.id to agent.displayName }

        userRepository.listSessions(paired.serverOrigin).fold(
            onSuccess = { collection ->
                catalog = collection.items.map { session ->
                    session.toSessionRow(workspaceByPath, agentLabels)
                }
                publish()
                _uiState.update { current -> current.copy(loading = false, error = null) }
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(loading = false, error = apiErrorMessage(error))
                }
            },
        )
    }

    private fun publish() {
        val search = _uiState.value.search.trim()
        val harolds = catalog
            .distinctBy { row -> row.serverOrigin }
            .filter { row -> row.serverOrigin.isNotEmpty() }
            .map { row ->
                HaroldFilterChoice(
                    serverOrigin = row.serverOrigin,
                    name = row.haroldName,
                    colorId = row.haroldColorId,
                    iconId = row.haroldIconId,
                )
            }
        val sessions = visibleSessionRows(catalog, haroldFilter)
            .filter { row -> search.isEmpty() || row.name.contains(search, ignoreCase = true) }
            .sortedByDescending { row -> row.updatedAt }
        _uiState.update { current ->
            current.copy(
                sessions = sessions,
                harolds = harolds,
                haroldFilter = haroldFilter,
            )
        }
    }

    private fun applyTitles(titles: Map<String, String>) {
        if (titles.isEmpty()) {
            return
        }
        catalog = catalog.map { row ->
            titles[row.id]?.let { title -> row.copy(name = title) } ?: row
        }
        publish()
    }
}
