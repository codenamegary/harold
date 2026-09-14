package server.agent.android.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import server.agent.android.live.SessionOwner
import server.agent.android.stream.ConnectionStatus
import server.agent.android.network.AgentApi
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway

private const val WORKSPACE_PROBE_LIMIT = 1

class ShellViewModel(
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val agentApi: AgentApi,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ShellUiState())
    val uiState: StateFlow<ShellUiState> = _uiState.asStateFlow()

    val showShell: StateFlow<Boolean> = combine(
        sessionGateway.pairedState,
        _uiState,
        sessionOwner.connectionState,
    ) { pairedState, shellState, connectionState ->
        when {
            pairedState is PairedState.NotPaired -> true
            shellState.probeUnauthorized -> true
            connectionState.status is ConnectionStatus.AuthFailed -> true
            else -> false
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    init {
        viewModelScope.launch {
            sessionGateway.refresh()
        }

        viewModelScope.launch {
            sessionGateway.pairedState.collect { pairedState ->
                _uiState.update { current -> current.fromPairedState(pairedState) }

                when (pairedState) {
                    PairedState.NotPaired -> sessionOwner.disconnect()
                    is PairedState.Paired -> open(pairedState.serverOrigin)
                }
            }
        }

        viewModelScope.launch {
            sessionOwner.connectionState.collect { state ->
                _uiState.update { current -> current.fromConnectionState(state) }

                if (state.status is ConnectionStatus.AuthFailed) {
                    sessionGateway.clearLocalAccess()
                }
            }
        }
    }

    fun onPairClick(onNavigateToPairing: () -> Unit) {
        onNavigateToPairing()
    }

    fun onRetryClick() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        sessionOwner.retry()
        probeWorkspaces(paired.serverOrigin)
    }

    private fun open(serverOrigin: String) {
        sessionOwner.connect(serverOrigin)
        probeWorkspaces(serverOrigin)
    }

    /**
     * Proves the authenticated HTTP path end to end without pulling in workspace
     * selection: one page of one workspace is enough to show reachable, empty, or
     * rejected.
     */
    private fun probeWorkspaces(serverOrigin: String) {
        _uiState.update { current -> current.fromWorkspaceProbe(WorkspaceProbe.Loading) }

        viewModelScope.launch {
            val probe = agentApi.listWorkspaces(serverOrigin, WORKSPACE_PROBE_LIMIT).fold(
                onSuccess = { collection ->
                    WorkspaceProbe.Loaded(count = collection.page.count ?: collection.items.size)
                },
                onFailure = ::probeFailure,
            )

            if (probe is WorkspaceProbe.Unauthorized) {
                sessionGateway.clearLocalAccess()
                return@launch
            }

            _uiState.update { current -> current.fromWorkspaceProbe(probe) }
        }
    }

    private fun probeFailure(error: Throwable): WorkspaceProbe =
        when (val apiError = (error as? AgentApiException)?.error) {
            is AgentApiError.Unauthorized -> WorkspaceProbe.Unauthorized(apiError.detail)
            is AgentApiError.Problem -> WorkspaceProbe.Failed(apiError.detail ?: apiError.title)
            is AgentApiError.Decode -> WorkspaceProbe.Failed("Unexpected response from Agent Server")
            is AgentApiError.Transport -> WorkspaceProbe.Failed("Could not reach Agent Server")
            null -> WorkspaceProbe.Failed(error.message ?: "Could not reach Agent Server")
        }
}

class ShellViewModelFactory(
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val agentApi: AgentApi,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ShellViewModel::class.java)) {
            return ShellViewModel(
                sessionGateway = sessionGateway,
                sessionOwner = sessionOwner,
                agentApi = agentApi,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
