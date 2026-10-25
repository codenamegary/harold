package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.chat.data.CachedSession
import harold.android.chat.data.SessionRepository
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
import harold.android.foreground.SessionAttentionMarks
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
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
    private val sessionOwner: SessionOwner,
    private val savedHaroldRepository: SavedHaroldRepository,
    private val sessionAttention: SessionAttentionMarks? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SessionsUiState())
    val uiState: StateFlow<SessionsUiState> = _uiState.asStateFlow()

    private var cached: List<CachedSession> = emptyList()
    private var catalog: List<SessionRow> = emptyList()
    private var savedHarolds: List<HaroldFilterChoice> = emptyList()
    private var savedByOrigin: Map<String, StoredCredential> = emptyMap()
    private val unreachableOrigins = mutableSetOf<String>()
    private var pushedTitles: Map<String, String> = emptyMap()
    private var haroldFilter: String? = null

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
            sessionRepository.deleteSession(
                serverOrigin = origin,
                agentId = row.agentId,
                sessionId = row.sessionId,
            ).fold(
                onSuccess = {
                    cached = cached.filterNot { session ->
                        session.serverOrigin == origin &&
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

        val saved = savedHaroldRepository.list()
        savedByOrigin = saved.associateBy { harold -> harold.serverOrigin }
        savedHarolds = saved.map { harold ->
            HaroldFilterChoice(
                serverOrigin = harold.serverOrigin,
                name = harold.name,
                colorId = harold.colorId,
                iconId = harold.iconId,
            )
        }

        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        val origins = saved.map { harold -> harold.serverOrigin }
            .ifEmpty { listOfNotNull(paired?.serverOrigin) }

        var anySuccess = false
        var lastError: Throwable? = null
        origins.forEach { serverOrigin ->
            sessionRepository.refresh(serverOrigin).fold(
                onSuccess = {
                    anySuccess = true
                    unreachableOrigins.remove(serverOrigin)
                },
                onFailure = { error ->
                    lastError = error
                    unreachableOrigins.add(serverOrigin)
                },
            )
        }

        val hasCache = origins.isNotEmpty() && cached.any { session -> session.serverOrigin in origins }
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
            val harold = savedByOrigin[session.serverOrigin]
            val row = session.toSessionRow().copy(
                serverOrigin = if (scopedToHarold) session.serverOrigin else "",
                haroldName = harold?.name.orEmpty(),
                haroldColorId = harold?.colorId.orEmpty(),
                haroldIconId = harold?.iconId.orEmpty(),
                haroldReachable = session.serverOrigin !in unreachableOrigins,
            )
            pushedTitles[row.id]?.let { title -> row.copy(name = title) } ?: row
        }
        publish()
    }

    private fun publish() {
        val search = _uiState.value.search.trim()
        val harolds = savedHarolds.ifEmpty {
            catalog
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
        pushedTitles = pushedTitles + titles
        rebuildCatalog()
    }
}
