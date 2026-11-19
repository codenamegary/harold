package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.SessionFolder
import harold.android.contracts.WorkspaceState
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.database.session.AgentRepository
import harold.android.database.session.CachedAgent
import harold.android.database.workspace.CachedWorkspace
import harold.android.database.workspace.WorkspaceRepository
import harold.android.navigation.CreatedWorkspaceResult
import harold.android.navigation.LastSessionSelection
import harold.android.navigation.Navigator
import harold.android.navigation.PreferredCreateSessionWorkspace
import harold.android.navigation.SessionPreferences
import harold.android.network.apiErrorMessage
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class CreateSessionViewModel @Inject constructor(
    private val connectionGateway: ConnectionGateway,
    private val agentRepository: AgentRepository,
    private val workspaceRepository: WorkspaceRepository,
    private val userRepository: UserRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
    private val sessionPreferences: SessionPreferences,
    private val connectionRepository: ConnectionRepository? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CreateSessionUiState())
    val uiState: StateFlow<CreateSessionUiState> = _uiState.asStateFlow()

    private var agentsJob: Job? = null
    private var agentsOrigin: String? = null
    private var workspaceJob: Job? = null
    private var savedConnections: List<SavedConnection> = emptyList()
    private var activeOrigin: String? = null
    private var pendingCreatedWorkspace: CreatedWorkspaceResult? = null
    private var rememberedSelection: LastSessionSelection? = null
    private var preferredWorkspace: PreferredCreateSessionWorkspace? = null
    private var preferredRowId: String? = null
    private var preferredAgentId: AgentId? = null
    private var preferredRequested = false
    private var recentSessionFoldersLoaded = false
    private var noticeDismissed = false

    init {
        viewModelScope.launch {
            loadConnectionMetadata()
            // The first Room emission must already know the remembered connection,
            // otherwise the first workspace wins before the value arrives.
            rememberedSelection = sessionPreferences.loadLastSessionSelection()
            preferredWorkspace = navigator.consumePreferredCreateSessionWorkspace()
            preferredRequested = preferredWorkspace != null
            preferredAgentId = preferredWorkspace?.agentId
            observeWorkspaces()
            refreshWorkspaces()
        }
        viewModelScope.launch {
            navigator.workspaceCreated.collect(::selectCreatedWorkspace)
        }
    }

    fun openNewWorkspace() {
        val state = _uiState.value
        val selected = state.workspaces.firstOrNull { row -> row.id == state.selectedWorkspaceId }
            ?: state.recentSessionFolders.firstOrNull { row -> row.id == state.selectedWorkspaceId }
        navigator.openAddWorkspace(preferredConnectionId = selected?.connectionId.orEmpty())
    }

    fun onWorkspaceChanged(workspaceId: String) {
        noticeDismissed = true
        val state = _uiState.value
        val workspace = state.workspaces.firstOrNull { row -> row.id == workspaceId }
            ?: state.recentSessionFolders.firstOrNull { row -> row.id == workspaceId }
        if (workspace == null || workspace.connectionId.isEmpty()) {
            _uiState.update { current ->
                current.copy(
                    selectedWorkspaceId = workspaceId,
                    error = null,
                    notice = null,
                )
            }
            return
        }
        // Agents are scoped to the connection, not the workspace. `selectWorkspace`
        // keeps the loaded list when the origin has not changed, so picking another
        // workspace on the same host no longer blanks the agent field.
        selectWorkspace(workspace)
    }

    fun onAgentChanged(agentId: AgentId) {
        _uiState.update { current ->
            current.copy(selectedAgentId = agentId, error = null)
        }
    }

    fun toggleRecentSessionFolders() {
        val expanded = !_uiState.value.recentSessionFoldersExpanded
        _uiState.update { current ->
            current.copy(recentSessionFoldersExpanded = expanded)
        }
        if (expanded && !recentSessionFoldersLoaded) {
            loadRecentSessionFolders()
        }
    }

    fun retryRecentSessionFolders() {
        loadRecentSessionFolders()
    }

    fun submit() {
        val createState = _uiState.value
        val workspaceId = createState.selectedWorkspaceId
        val agentId = createState.selectedAgentId
        val workspace = createState.workspaces.firstOrNull { row -> row.id == workspaceId }
            ?: createState.recentSessionFolders.firstOrNull { row -> row.id == workspaceId }

        if (workspaceId.isEmpty() || workspace == null) {
            _uiState.update { current -> current.copy(error = "Choose a workspace") }
            return
        }

        if (agentId == null) {
            if (_uiState.value.error == null) {
                _uiState.update { current -> current.copy(error = "Choose an agent") }
            }
            return
        }

        val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
        val origin = workspace.connectionId.ifEmpty { active?.connectionId }
        if (origin == null) {
            _uiState.update { current -> current.copy(error = "Connect to Harold first") }
            return
        }

        _uiState.update { current -> current.copy(submitting = true, error = null) }

        // Config options only exist once the agent has a session, so create it
        // on confirm for the selectors to render before the first prompt.
        viewModelScope.launch {
            val result = userRepository.createSession(
                connectionId = origin,
                body = CreateSessionBody(
                    agentId = agentId,
                    cwd = workspace.path,
                ),
            )

            result.fold(
                onSuccess = { created ->
                    sessionCommands.emit(
                        SessionCommand.Created(
                            response = created,
                            connectionId = origin,
                            connectionName = workspace.connectionName,
                            connectionColorId = workspace.connectionColorId,
                            connectionIconId = workspace.connectionIconId,
                        ),
                    )
                    navigator.goBack()
                },
                onFailure = { error ->
                    if (agentNeedsLogin(origin, agentId)) {
                        sessionCommands.emit(SessionCommand.Pending(workspace, agentId))
                        navigator.goBack()
                        return@fold
                    }
                    _uiState.update { current ->
                        current.copy(submitting = false, error = apiErrorMessage(error))
                    }
                },
            )
        }
    }

    private suspend fun loadConnectionMetadata() {
        savedConnections = connectionRepository?.list().orEmpty()
        activeOrigin = (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId
    }

    private fun observeWorkspaces() {
        workspaceJob?.cancel()
        workspaceJob = viewModelScope.launch {
            workspaceRepository.observe().collect(::applyCachedWorkspaces)
        }
    }

    private suspend fun refreshWorkspaces() {
        targetOrigins().forEach { connectionId ->
            workspaceRepository.refresh(connectionId)
        }
    }

    private fun applyCachedWorkspaces(cached: List<CachedWorkspace>) {
        val origins = targetOrigins()
        val savedByOrigin = savedConnections.associateBy { connection -> connection.connectionId }
        val scoped = savedConnections.isNotEmpty()
        val rows = disambiguateWorkspaceLabels(
            cached
                .filter { workspace -> workspace.connectionId in origins }
                .mapNotNull { cachedWorkspace ->
                    val workspace = cachedWorkspace.workspace
                    if (workspace.state != WorkspaceState.Available) {
                        return@mapNotNull null
                    }
                    val connection = savedByOrigin[cachedWorkspace.connectionId]
                    workspace.toWorkspaceRow().copy(
                        id = if (scoped) {
                            "${cachedWorkspace.connectionId}|${workspace.id}"
                        } else {
                            workspace.id
                        },
                        connectionId = cachedWorkspace.connectionId,
                        connectionName = connection?.name.orEmpty(),
                        connectionColorId = connection?.colorId.orEmpty(),
                        connectionIconId = connection?.iconId.orEmpty(),
                    )
                },
        )

        val current = _uiState.value
        val (labeledRows, labeledRecentFolders) =
            labelWorkspaces(rows, current.recentSessionFolders)
        val pendingId = pendingCreatedWorkspace?.let { created ->
            workspaceId(created.connectionId, created.workspaceId)
        }
        val pendingRow = pendingId?.let { id -> rows.firstOrNull { row -> row.id == id } }
        val explicitRow = rows.firstOrNull { row -> row.id == current.selectedWorkspaceId }
            ?: current.recentSessionFolders.firstOrNull { row -> row.id == current.selectedWorkspaceId }
        val preferredRow = preferredWorkspace?.let { preferred ->
            rows.firstOrNull { row ->
                row.path == preferred.path &&
                    (preferred.connectionId.isEmpty() || row.connectionId == preferred.connectionId)
            }
        }
        val defaultRow = rows.firstOrNull { row ->
            row.connectionId == defaultWorkspaceOrigin() &&
                row.path == defaultWorkspacePath()
        }
        val rememberedRow = rememberedSelection?.let { remembered ->
            val rememberedId = workspaceId(remembered.connectionId, remembered.workspaceId)
            rows.firstOrNull { row -> row.id == rememberedId }
        }
        val singleSavedRow = rows.singleOrNull()
        val selected = pendingRow
            ?: explicitRow
            ?: preferredRow
            ?: defaultRow
            ?: rememberedRow
            ?: singleSavedRow

        // A path or id that is no longer saved must never be replaced by
        // another saved path without telling the user.
        val missingPreferred = preferredWorkspace != null && preferredRow == null
        val missingRemembered = rememberedSelection != null && rememberedRow == null
        if (preferredRow != null) {
            preferredRowId = preferredRow.id
            preferredWorkspace = null
        } else if (missingPreferred) {
            // Keep the requested path pending so the notice survives later
            // cache emissions, and select it if the folder is saved later.
            preferredAgentId = null
        }
        val missingNotice = when {
            missingPreferred -> CreateSessionNotice.PreferredWorkspaceMissing
            preferredRequested -> null
            missingRemembered -> CreateSessionNotice.RememberedWorkspaceMissing
            else -> null
        }
        val notice = when {
            noticeDismissed -> null
            current.notice == missingNotice -> current.notice
            else -> missingNotice
        }

        val agentsForSelection = selected != null && selected.connectionId == agentsOrigin

        _uiState.update { state ->
            state.copy(
                workspaces = labeledRows,
                recentSessionFolders = labeledRecentFolders,
                selectedWorkspaceId = selected?.id.orEmpty(),
                agents = if (agentsForSelection) state.agents else emptyList(),
                selectedAgentId = if (agentsForSelection) state.selectedAgentId else null,
                notice = notice,
            )
        }
        if (selected != null && selected.connectionId.isNotEmpty() && !agentsForSelection) {
            loadAgents(selected)
        }
        if (selected != null && selected.id == pendingId) {
            pendingCreatedWorkspace = null
        }
    }

    private fun loadRecentSessionFolders() {
        if (_uiState.value.recentSessionFoldersLoading) {
            return
        }
        _uiState.update { current ->
            current.copy(
                recentSessionFoldersLoading = true,
                recentSessionFoldersError = null,
            )
        }
        viewModelScope.launch {
            val rows = mutableListOf<WorkspaceRow>()
            var failure: Throwable? = null
            targetOrigins().forEach { connectionId ->
                userRepository.listRecentSessionFolders(connectionId).fold(
                    onSuccess = { collection ->
                        rows += sessionFolderRows(connectionId, collection.items)
                    },
                    onFailure = { error ->
                        failure = error
                    },
                )
            }
            recentSessionFoldersLoaded = failure == null
            val current = _uiState.value
            val (labeledWorkspaces, labeledFolders) = labelWorkspaces(
                saved = current.workspaces,
                hints = rows,
            )
            _uiState.update { state ->
                state.copy(
                    workspaces = labeledWorkspaces,
                    recentSessionFolders = labeledFolders,
                    recentSessionFoldersLoading = false,
                    recentSessionFoldersError = failure?.let(::apiErrorMessage),
                )
            }
        }
    }

    private fun sessionFolderRows(
        connectionId: String,
        folders: List<SessionFolder>,
    ): List<WorkspaceRow> {
        val connection = savedConnections.find { saved -> saved.connectionId == connectionId }
        return folders.map { folder ->
            WorkspaceRow(
                id = sessionFolderRowId(connectionId, folder.id),
                name = folder.name.ifBlank { folder.path.substringAfterLast('/').ifBlank { folder.path } },
                path = folder.path,
                state = WorkspaceState.Available,
                connectionId = connectionId,
                connectionName = connection?.name.orEmpty(),
                connectionColorId = connection?.colorId.orEmpty(),
                connectionIconId = connection?.iconId.orEmpty(),
                source = WorkspaceSource.SessionFolder,
            )
        }
    }

    private fun sessionFolderRowId(connectionId: String, folderId: String): String =
        if (savedConnections.isNotEmpty()) {
            "session:$connectionId|$folderId"
        } else {
            folderId.takeIf { id -> id.startsWith("session:") } ?: "session:$folderId"
        }

    /**
     * Labels are computed across saved workspaces and hints together so a
     * saved `harold` and a session-folder `harold` are distinguishable too.
     */
    private fun labelWorkspaces(
        saved: List<WorkspaceRow>,
        hints: List<WorkspaceRow>,
    ): Pair<List<WorkspaceRow>, List<WorkspaceRow>> {
        val labeled = disambiguateWorkspaceLabels(saved + hints)
        return labeled.filter { row -> row.source == WorkspaceSource.Saved } to
            labeled.filter { row -> row.source == WorkspaceSource.SessionFolder }
    }

    private fun selectCreatedWorkspace(result: CreatedWorkspaceResult) {
        noticeDismissed = true
        pendingCreatedWorkspace = result
        val targetId = workspaceId(result.connectionId, result.workspaceId)
        val workspace = _uiState.value.workspaces.firstOrNull { row ->
            row.id == targetId ||
                (row.connectionId == result.connectionId && row.id == result.workspaceId)
        }
        if (workspace == null) {
            return
        }
        pendingCreatedWorkspace = null
        selectWorkspace(workspace)
    }

    private fun selectWorkspace(workspace: WorkspaceRow) {
        val sameOrigin = workspace.connectionId == agentsOrigin &&
            _uiState.value.agents.isNotEmpty()
        _uiState.update { current ->
            current.copy(
                selectedWorkspaceId = workspace.id,
                error = null,
                notice = null,
                agents = if (sameOrigin) current.agents else emptyList(),
                selectedAgentId = if (sameOrigin) current.selectedAgentId else null,
            )
        }
        if (!sameOrigin) {
            loadAgents(workspace)
        }
    }

    private fun targetOrigins(): List<String> =
        if (savedConnections.isNotEmpty()) {
            savedConnections.map { connection -> connection.connectionId }.distinct()
        } else {
            listOfNotNull(activeOrigin)
        }

    private fun workspaceId(connectionId: String, workspaceId: String): String =
        if (savedConnections.isNotEmpty()) {
            "$connectionId|$workspaceId"
        } else {
            workspaceId
        }

    private fun loadAgents(workspace: WorkspaceRow) {
        val origin = workspace.connectionId.ifEmpty { return }
        observeAgents(origin)
        viewModelScope.launch {
            agentRepository.refreshAgents(origin).onFailure { error ->
                if (agentsOrigin == origin && _uiState.value.agents.isEmpty()) {
                    _uiState.update { current ->
                        current.copy(
                            agents = emptyList(),
                            selectedAgentId = null,
                            submitting = false,
                            error = apiErrorMessage(error),
                        )
                    }
                }
            }
        }
    }

    private fun observeAgents(connectionId: String) {
        if (agentsOrigin == connectionId && agentsJob != null) {
            return
        }
        agentsJob?.cancel()
        agentsOrigin = connectionId
        agentsJob = viewModelScope.launch {
            agentRepository.observeAgents(connectionId).collect { agents ->
                if (agentsOrigin == connectionId) {
                    applyAgents(agents)
                }
            }
        }
    }

    private fun applyAgents(cachedAgents: List<CachedAgent>) {
        val agents = cachedAgents
            .filter { agent -> agent.enabled }
            .map { agent -> AgentOption(id = agent.agentId, displayName = agent.displayName) }
        val current = _uiState.value
        val workspace = selectedWorkspace()
        val preferredAgent = preferredAgentId
            ?.takeIf { workspace?.id == preferredRowId }
            ?.takeIf { preferred -> agents.any { agent -> agent.id == preferred } }
        val rememberedAgent = rememberedAgentForSelectedWorkspace()
            ?.takeIf { remembered -> agents.any { agent -> agent.id == remembered } }
        val selectedAgent = current.selectedAgentId
            ?.takeIf { selected -> agents.any { agent -> agent.id == selected } }
            ?: preferredAgent
            ?: rememberedAgent
            ?: defaultAgentForSelectedWorkspace(agents)
            ?: lastUsedAgentForSelectedConnection()
                ?.takeIf { lastUsed -> agents.any { agent -> agent.id == lastUsed } }
            ?: agents.firstOrNull()?.id
        if (agents.isNotEmpty()) {
            preferredAgentId = null
        }
        _uiState.update { state ->
            state.copy(
                agents = agents,
                selectedAgentId = selectedAgent,
                error = null,
            )
        }
    }

    /**
     * Device-local default workspace: the saved connection whose default the
     * user picked in connection settings, matched by host path.
     */
    private fun defaultWorkspacePath(): String? =
        savedConnections
            .find { connection -> connection.connectionId == defaultWorkspaceOrigin() }
            ?.defaultWorkspacePath

    private fun defaultWorkspaceOrigin(): String? =
        savedConnections
            .firstOrNull { connection -> !connection.defaultWorkspacePath.isNullOrBlank() }
            ?.connectionId

    private fun defaultAgentForSelectedWorkspace(agents: List<AgentOption>): AgentId? {
        val origin = selectedWorkspace()?.connectionId ?: return null
        val default = savedConnections
            .find { connection -> connection.connectionId == origin }
            ?.defaultAgentId
            ?: return null
        return default.takeIf { id -> agents.any { agent -> agent.id == id } }
    }

    private fun rememberedAgentForSelectedWorkspace(): AgentId? {
        val remembered = rememberedSelection ?: return null
        val selected = selectedWorkspace() ?: return null
        val rememberedId = workspaceId(remembered.connectionId, remembered.workspaceId)
        return remembered.agentId.takeIf { selected.id == rememberedId }
    }

    private fun lastUsedAgentForSelectedConnection(): AgentId? {
        val remembered = rememberedSelection ?: return null
        val selected = selectedWorkspace() ?: return null
        return remembered.agentId.takeIf { selected.connectionId == remembered.connectionId }
    }

    private fun selectedWorkspace(): WorkspaceRow? {
        val state = _uiState.value
        return state.workspaces.firstOrNull { row -> row.id == state.selectedWorkspaceId }
            ?: state.recentSessionFolders.firstOrNull { row -> row.id == state.selectedWorkspaceId }
    }

    private suspend fun agentNeedsLogin(connectionId: String, agentId: AgentId): Boolean =
        userRepository.getAgentAuth(connectionId = connectionId, agentId = agentId)
            .getOrNull()
            ?.status == AgentAuthStatus.NeedsAuth
}
