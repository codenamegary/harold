package server.agent.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import server.agent.android.navigation.AppNavHost
import server.agent.android.shell.ShellViewModel
import server.agent.android.shell.ShellViewModelFactory
import server.agent.android.ui.theme.AgentServerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val appContainer = (application as AgentServerApplication).appContainer

        enableEdgeToEdge()
        setContent {
            AgentServerTheme {
                val shellViewModel: ShellViewModel = viewModel(
                    factory = ShellViewModelFactory(appContainer),
                )
                val shellUiState by shellViewModel.uiState.collectAsState()

                AppNavHost(
                    shellUiState = shellUiState,
                    onPairClick = shellViewModel::onPairClick,
                )
            }
        }
    }
}
