package harold.android.connections

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentSettings
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.FilesystemDirectory
import harold.android.contracts.UpdateAgentBody
import harold.android.navigation.Navigator
import harold.android.network.apiErrorMessage
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AgentCategory {
    All,
    Enabled,
    Popular,
}

/** One row on the Agents screen. */
data class AgentRow(
    val id: String,
    val displayName: String,
    val path: String?,
    val args: List<String>,
    val binDir: String? = null,
    val binDirVersion: String? = null,
    val requiredNodeMajor: Int? = null,
    val enabled: Boolean,
    val present: Boolean,
    val popular: Boolean,
    val custom: Boolean,
    val dismissed: Boolean,
    val authStatus: AgentAuthStatus,
    val authError: String?,
    val canLogout: Boolean,
)

enum class BinDirTarget {
    Edit,
    Create,
}

data class BinDirPickerUiState(
    val open: Boolean = false,
    val target: BinDirTarget = BinDirTarget.Edit,
    val path: String = "",
    val parent: String? = null,
    val folders: List<FilesystemDirectory> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
    val query: String = "",
)

data class AgentsUiState(
    val connectionId: String = "",
    val loading: Boolean = true,
    val rows: List<AgentRow> = emptyList(),
    val dismissedRows: List<AgentRow> = emptyList(),
    val scanning: Boolean = false,
    val error: String? = null,
    val editingAgentId: String? = null,
    val editDisplayName: String = "",
    val editPath: String = "",
    val editArgs: String = "",
    val editBinDir: String = "",
    val editBinDirVersion: String? = null,
    val editEnabled: Boolean = true,
    val showCreateCustom: Boolean = false,
    val createName: String = "",
    val createPath: String = "",
    val createArgs: String = "",
    val createBinDir: String = "",
    val createBinDirVersion: String? = null,
    val binDirPicker: BinDirPickerUiState = BinDirPickerUiState(),
    val searchQuery: String = "",
    val selectedCategory: AgentCategory = AgentCategory.All,
) {
    val showEditor: Boolean get() = editingAgentId != null
    val totalCount: Int get() = rows.size
    val enabledCount: Int get() = rows.count { it.enabled }
    val popularCount: Int get() = rows.count { it.popular }
}

@HiltViewModel
class AgentsViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val navigator: Navigator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AgentsUiState())
    val uiState: StateFlow<AgentsUiState> = _uiState.asStateFlow()

    private var startedKey: String? = null

    private var connectionId: String = ""

    /** Called once per route instance from the nav entry. */
    fun start(connectionId: String) {
        if (startedKey == connectionId) {
            return
        }
        startedKey = connectionId
        this.connectionId = connectionId
        _uiState.update { current -> current.copy(connectionId = connectionId) }
        refresh()
    }

    fun onSearchQueryChanged(value: String) {
        _uiState.update { current -> current.copy(searchQuery = value) }
    }

    fun onCategorySelected(category: AgentCategory) {
        _uiState.update { current -> current.copy(selectedCategory = category) }
    }

    fun refresh() {
        _uiState.update { current -> current.copy(loading = true, error = null) }
        viewModelScope.launch {
            userRepository.listAgents(connectionId).fold(
                onSuccess = { collection -> applyAgents(collection.items) },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(loading = false, error = error.message ?: "Could not read agents.")
                    }
                },
            )
        }
    }

    fun scan() {
        _uiState.update { current -> current.copy(scanning = true, error = null) }
        viewModelScope.launch {
            userRepository.scanAgents(connectionId).fold(
                onSuccess = { collection ->
                    applyAgents(collection.items, scanning = false)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(scanning = false, error = error.message ?: "Scan failed.")
                    }
                },
            )
        }
    }

    fun reload() {
        _uiState.update { current -> current.copy(error = null) }
        viewModelScope.launch {
            userRepository.reloadConfig(connectionId).fold(
                onSuccess = { collection -> applyAgents(collection.items) },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(error = error.message ?: "Reload failed.")
                    }
                },
            )
        }
    }

    fun restart(agentId: String) {
        viewModelScope.launch {
            userRepository.restartAgent(connectionId, agentId)
            refresh()
        }
    }

    fun toggleEnabled(agentId: String, enabled: Boolean) {
        // Optimistically update the local row so the switch flips immediately in place
        _uiState.update { current ->
            val idx = current.rows.indexOfFirst { it.id == agentId }
            if (idx >= 0) {
                val updatedRow = current.rows[idx].copy(enabled = enabled)
                val newRows = current.rows.toMutableList().apply { set(idx, updatedRow) }
                current.copy(rows = newRows)
            } else {
                current
            }
        }
        viewModelScope.launch {
            userRepository.updateAgent(
                connectionId,
                agentId,
                UpdateAgentBody(enabled = enabled),
            ).fold(
                onSuccess = { agent -> replaceAgent(agent) },
                onFailure = { error ->
                    // Revert on failure
                    _uiState.update { current ->
                        val idx = current.rows.indexOfFirst { it.id == agentId }
                        if (idx >= 0) {
                            val revertedRow = current.rows[idx].copy(enabled = !enabled)
                            val newRows = current.rows.toMutableList().apply { set(idx, revertedRow) }
                            current.copy(
                                rows = newRows,
                                error = error.message ?: "Could not update the agent.",
                            )
                        } else {
                            current.copy(error = error.message ?: "Could not update the agent.")
                        }
                    }
                },
            )
        }
    }

    fun startEdit(agentId: String) {
        val row = _uiState.value.rows.find { it.id == agentId }
            ?: _uiState.value.dismissedRows.find { it.id == agentId }
            ?: return
        _uiState.update { current ->
            current.copy(
                editingAgentId = row.id,
                editDisplayName = row.displayName,
                editPath = row.path.orEmpty(),
                editArgs = row.args.joinToString(" "),
                editBinDir = row.binDir.orEmpty(),
                editBinDirVersion = row.binDirVersion,
                editEnabled = row.enabled,
            )
        }
    }

    fun onEditDisplayNameChanged(value: String) {
        _uiState.update { current -> current.copy(editDisplayName = value) }
    }

    fun onEditPathChanged(value: String) {
        _uiState.update { current -> current.copy(editPath = value) }
    }

    fun onEditArgsChanged(value: String) {
        _uiState.update { current -> current.copy(editArgs = value) }
    }

    fun onEditBinDirChanged(value: String) {
        _uiState.update { current ->
            current.copy(editBinDir = value, editBinDirVersion = null)
        }
    }

    fun onEditEnabledChanged(value: Boolean) {
        _uiState.update { current -> current.copy(editEnabled = value) }
    }

    fun saveEdit() {
        val state = _uiState.value
        val agentId = state.editingAgentId ?: return
        viewModelScope.launch {
            userRepository.updateAgent(
                connectionId,
                agentId,
                UpdateAgentBody(
                    displayName = state.editDisplayName.trim().takeIf { it.isNotBlank() },
                    path = state.editPath.trim(),
                    args = state.editArgs.split(' ').filter { it.isNotBlank() },
                    binDir = state.editBinDir.trim(),
                    enabled = state.editEnabled,
                ),
            ).fold(
                onSuccess = { agent ->
                    replaceAgent(agent)
                    cancelEdit()
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(error = error.message ?: "Could not save the agent.")
                    }
                },
            )
        }
    }

    fun cancelEdit() {
        _uiState.update { current -> current.copy(editingAgentId = null) }
    }

    fun delete(agentId: String) {
        viewModelScope.launch {
            userRepository.deleteAgent(connectionId, agentId).fold(
                onSuccess = { refresh() },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(error = error.message ?: "Could not remove the agent.")
                    }
                },
            )
        }
    }

    fun restore(agentId: String) {
        viewModelScope.launch {
            userRepository.updateAgent(
                connectionId,
                agentId,
                UpdateAgentBody(dismissed = false),
            ).fold(
                onSuccess = { agent -> replaceAgent(agent) },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(error = error.message ?: "Could not restore the agent.")
                    }
                },
            )
        }
    }

    fun startCreateCustom() {
        _uiState.update { current ->
            current.copy(
                showCreateCustom = true,
                createName = "",
                createPath = "",
                createArgs = "",
                createBinDir = "",
                createBinDirVersion = null,
            )
        }
    }

    fun onCreateNameChanged(value: String) {
        _uiState.update { current -> current.copy(createName = value) }
    }

    fun onCreatePathChanged(value: String) {
        _uiState.update { current -> current.copy(createPath = value) }
    }

    fun onCreateArgsChanged(value: String) {
        _uiState.update { current -> current.copy(createArgs = value) }
    }

    fun onCreateBinDirChanged(value: String) {
        _uiState.update { current ->
            current.copy(createBinDir = value, createBinDirVersion = null)
        }
    }

    fun createCustom() {
        val state = _uiState.value
        val path = state.createPath.trim()
        if (path.isEmpty()) {
            return
        }
        viewModelScope.launch {
            userRepository.createCustomAgent(
                connectionId,
                CreateCustomAgentBody(
                    displayName = state.createName.trim().ifBlank { "Custom agent" },
                    path = path,
                    args = state.createArgs.split(' ').filter { it.isNotBlank() },
                    binDir = state.createBinDir.trim().ifBlank { null },
                ),
            ).fold(
                onSuccess = { agent ->
                    replaceAgent(agent)
                    cancelCreateCustom()
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(error = error.message ?: "Could not create the agent.")
                    }
                },
            )
        }
    }

    fun cancelCreateCustom() {
        _uiState.update { current ->
            current.copy(
                showCreateCustom = false,
                createName = "",
                createPath = "",
                createArgs = "",
                createBinDir = "",
                createBinDirVersion = null,
            )
        }
    }

    /** Opens the remote folder browser for one of the bin directory fields. */
    fun openBinDirPicker(target: BinDirTarget) {
        val state = _uiState.value
        val initial = when (target) {
            BinDirTarget.Edit -> state.editBinDir
            BinDirTarget.Create -> state.createBinDir
        }.trim().takeIf { path -> path.isNotEmpty() }
        _uiState.update { current ->
            current.copy(
                binDirPicker = BinDirPickerUiState(
                    open = true,
                    target = target,
                    loading = true,
                ),
            )
        }
        loadBinDirBrowser(initial)
    }

    fun onBinDirOpenFolder(path: String) {
        _uiState.update { current ->
            current.copy(
                binDirPicker = current.binDirPicker.copy(
                    query = "",
                    loading = true,
                    error = null,
                ),
            )
        }
        loadBinDirBrowser(path)
    }

    fun onBinDirUp() {
        val parent = _uiState.value.binDirPicker.parent ?: return
        onBinDirOpenFolder(parent)
    }

    fun onBinDirQueryChanged(value: String) {
        _uiState.update { current ->
            current.copy(binDirPicker = current.binDirPicker.copy(query = value))
        }
    }

    /** Chooses the folder the browser is currently showing. */
    fun onBinDirUseCurrent() {
        val picker = _uiState.value.binDirPicker
        val path = picker.path
        if (path.isEmpty()) {
            return
        }
        _uiState.update { current ->
            when (picker.target) {
                BinDirTarget.Edit -> current.copy(
                    editBinDir = path,
                    editBinDirVersion = null,
                    binDirPicker = current.binDirPicker.copy(open = false),
                )
                BinDirTarget.Create -> current.copy(
                    createBinDir = path,
                    createBinDirVersion = null,
                    binDirPicker = current.binDirPicker.copy(open = false),
                )
            }
        }
    }

    fun onBinDirCancel() {
        _uiState.update { current ->
            current.copy(binDirPicker = current.binDirPicker.copy(open = false))
        }
    }

    private fun loadBinDirBrowser(root: String?) {
        viewModelScope.launch {
            userRepository.listFilesystemDirectories(connectionId, root).fold(
                onSuccess = { collection ->
                    _uiState.update { current ->
                        current.copy(
                            binDirPicker = current.binDirPicker.copy(
                                path = collection.path,
                                parent = collection.parent,
                                folders = collection.items,
                                loading = false,
                                error = null,
                            ),
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            binDirPicker = current.binDirPicker.copy(
                                loading = false,
                                error = apiErrorMessage(error),
                            ),
                        )
                    }
                },
            )
        }
    }

    fun goBack() {
        navigator.goBack()
    }

    private fun applyAgents(
        agents: List<AgentSettings>,
        scanning: Boolean = _uiState.value.scanning,
    ) {
        val sorted = agents.sortedWith(
            compareByDescending<AgentSettings> { it.enabled }
                .thenByDescending { it.popular }
                .thenByDescending { it.present }
                .thenBy { it.displayName.lowercase() },
        )
        val rows = sorted.filterNot { it.dismissed }.map(::agentRow)
        val dismissed = sorted.filter { it.dismissed }.map(::agentRow)
        _uiState.update { current ->
            current.copy(
                loading = false,
                scanning = scanning,
                rows = rows,
                dismissedRows = dismissed,
            )
        }
    }

    private fun replaceAgent(agent: AgentSettings) {
        val row = agentRow(agent)
        _uiState.update { current ->
            if (row.dismissed) {
                val dismissIdx = current.dismissedRows.indexOfFirst { it.id == row.id }
                val newDismissed = if (dismissIdx >= 0) {
                    current.dismissedRows.toMutableList().apply { set(dismissIdx, row) }
                } else {
                    current.dismissedRows + row
                }
                current.copy(
                    rows = current.rows.filterNot { it.id == row.id },
                    dismissedRows = newDismissed,
                )
            } else {
                val activeIdx = current.rows.indexOfFirst { it.id == row.id }
                val newRows = if (activeIdx >= 0) {
                    current.rows.toMutableList().apply { set(activeIdx, row) }
                } else {
                    current.rows + row
                }
                current.copy(
                    rows = newRows,
                    dismissedRows = current.dismissedRows.filterNot { it.id == row.id },
                )
            }
        }
    }

    private fun agentRow(agent: AgentSettings): AgentRow = AgentRow(
        id = agent.id,
        displayName = agent.displayName,
        path = agent.path,
        args = agent.args,
        binDir = agent.binDir,
        binDirVersion = agent.binDirVersion,
        requiredNodeMajor = agent.requiredNodeMajor,
        enabled = agent.enabled,
        present = agent.present,
        popular = agent.popular,
        custom = agent.deletable,
        dismissed = agent.dismissed,
        authStatus = agent.authSummary.status,
        authError = agent.authSummary.error,
        canLogout = agent.authSummary.canLogout,
    )
}
