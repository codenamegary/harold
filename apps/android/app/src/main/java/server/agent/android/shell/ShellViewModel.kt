package server.agent.android.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import server.agent.android.di.AppContainer

class ShellViewModel(
    private val appContainer: AppContainer,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ShellUiState())
    val uiState: StateFlow<ShellUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            appContainer.sessionGateway.refresh()
        }

        viewModelScope.launch {
            appContainer.sessionGateway.pairedState.collect { pairedState ->
                _uiState.update { current -> current.fromPairedState(pairedState) }
            }
        }
    }

    fun onPairClick(onNavigateToPairing: () -> Unit) {
        onNavigateToPairing()
    }
}

class ShellViewModelFactory(
    private val appContainer: AppContainer,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ShellViewModel::class.java)) {
            return ShellViewModel(appContainer) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
