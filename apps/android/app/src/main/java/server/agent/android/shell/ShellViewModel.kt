package server.agent.android.shell

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import server.agent.android.di.AppContainer

data class ShellUiState(
    val title: String = "Agent Server",
    val status: String = "Not paired",
    val pairEnabled: Boolean = false,
)

class ShellViewModel(
    private val appContainer: AppContainer,
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        ShellUiState(
            pairEnabled = appContainer.sessionGateway.isPaired(),
        ),
    )
    val uiState: StateFlow<ShellUiState> = _uiState.asStateFlow()

    fun onPairClick() {
        _uiState.update { current ->
            current.copy(pairEnabled = appContainer.sessionGateway.isPaired())
        }
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
