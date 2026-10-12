package harold.android.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import harold.android.live.SessionOwner
import harold.android.navigation.Navigator
import harold.android.network.AgentApi
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.stream.ConnectionStatus

private const val WORKSPACE_PROBE_LIMIT = 1

@HiltViewModel
class ShellViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val agentApi: AgentApi,
    private val navigator: Navigator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ShellUiState())
    val uiState: StateFlow<ShellUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            sessionGateway.refresh()
            navigator.start(paired = sessionGateway.pairedState.value is PairedState.Paired)
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
                    navigator.showShell()
                }
            }
        }
    }

    fun onPairClick() {
        navigator.openPairing()
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
                navigator.showShell()
                return@launch
            }

            _uiState.update { current -> current.fromWorkspaceProbe(probe) }
        }
    }

    private fun probeFailure(error: Throwable): WorkspaceProbe =
        when (val apiError = (error as? AgentApiException)?.error) {
            is AgentApiError.Unauthorized -> WorkspaceProbe.Unauthorized(apiError.detail)
            is AgentApiError.Problem -> WorkspaceProbe.Failed(apiError.detail ?: apiError.title)
            is AgentApiError.Decode -> WorkspaceProbe.Failed("Unexpected response from Harold")
            is AgentApiError.Transport -> WorkspaceProbe.Failed("Could not reach Harold")
            null -> WorkspaceProbe.Failed(error.message ?: "Could not reach Harold")
        }
}
