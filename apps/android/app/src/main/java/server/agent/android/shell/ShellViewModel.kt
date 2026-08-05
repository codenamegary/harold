package server.agent.android.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import server.agent.android.connection.ConnectionGateway
import server.agent.android.network.AgentApi
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway

private const val WORKSPACE_PROBE_LIMIT = 1

class ShellViewModel(
    private val sessionGateway: SessionGateway,
    private val connectionGateway: ConnectionGateway,
    private val agentApi: AgentApi,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ShellUiState())
    val uiState: StateFlow<ShellUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            sessionGateway.refresh()
        }

        viewModelScope.launch {
            sessionGateway.pairedState.collect { pairedState ->
                _uiState.update { current -> current.fromPairedState(pairedState) }

                when (pairedState) {
                    PairedState.NotPaired -> connectionGateway.disconnect()
                    is PairedState.Paired -> open(pairedState.serverOrigin)
                }
            }
        }

        viewModelScope.launch {
            connectionGateway.state.collect { state ->
                _uiState.update { current -> current.fromConnectionState(state) }
            }
        }
    }

    fun onPairClick(onNavigateToPairing: () -> Unit) {
        onNavigateToPairing()
    }

    fun onRetryClick() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        connectionGateway.retry()
        probeWorkspaces(paired.serverOrigin)
    }

    private fun open(serverOrigin: String) {
        connectionGateway.connect(serverOrigin)
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
    private val connectionGateway: ConnectionGateway,
    private val agentApi: AgentApi,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ShellViewModel::class.java)) {
            return ShellViewModel(
                sessionGateway = sessionGateway,
                connectionGateway = connectionGateway,
                agentApi = agentApi,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
