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
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.WorkspaceApi
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import harold.android.stream.StreamStatus

private const val WORKSPACE_PROBE_LIMIT = 1

@HiltViewModel
class ShellViewModel @Inject constructor(
    private val connectionGateway: ConnectionGateway,
    private val sessionOwner: SessionOwner,
    private val agentApi: WorkspaceApi,
    private val navigator: Navigator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ShellUiState())
    val uiState: StateFlow<ShellUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            connectionGateway.refresh()
            navigator.start(hasConnection = connectionGateway.activeConnection.value is ActiveConnectionState.Active)
        }

        viewModelScope.launch {
            connectionGateway.activeConnection.collect { activeConnection ->
                _uiState.update { current -> current.fromActiveConnectionState(activeConnection) }

                when (activeConnection) {
                    ActiveConnectionState.NoConnection -> sessionOwner.disconnect()
                    is ActiveConnectionState.Active -> open(activeConnection.connectionId)
                }
            }
        }

        viewModelScope.launch {
            sessionOwner.connectionState.collect { state ->
                _uiState.update { current -> current.fromConnectionState(state) }
            }
        }
    }

    fun onAddConnectionClick() {
        navigator.openAddConnection()
    }

    fun onForeground() {
        sessionOwner.onForeground()
    }

    fun onBackground() {
        sessionOwner.onBackground()
    }

    fun onRetryClick() {
        val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active ?: return

        sessionOwner.retry()
        probeWorkspaces(active.connectionId)
    }

    private fun open(connectionId: String) {
        sessionOwner.connect(connectionId)
        probeWorkspaces(connectionId)
    }

    /**
     * Proves the SSH path end to end without pulling in workspace selection:
     * one page of one workspace is enough to show reachable, empty, or failed.
     */
    private fun probeWorkspaces(connectionId: String) {
        _uiState.update { current -> current.fromWorkspaceProbe(WorkspaceProbe.Loading) }

        viewModelScope.launch {
            val probe = agentApi.listWorkspaces(connectionId, WORKSPACE_PROBE_LIMIT).fold(
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
            is AgentApiError.Problem -> WorkspaceProbe.Failed(apiError.detail ?: apiError.title)
            is AgentApiError.Transport -> WorkspaceProbe.Failed("Could not reach Harold")
            is AgentApiError.Unavailable -> WorkspaceProbe.Failed(apiError.detail)
            null -> WorkspaceProbe.Failed(error.message ?: "Could not reach Harold")
        }
}
