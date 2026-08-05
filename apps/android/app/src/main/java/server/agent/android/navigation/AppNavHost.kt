package server.agent.android.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import server.agent.android.shell.ShellScreen
import server.agent.android.shell.ShellUiState

@Composable
fun AppNavHost(
    shellUiState: ShellUiState,
    onPairClick: () -> Unit,
) {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Routes.Shell,
    ) {
        composable(Routes.Shell) {
            ShellScreen(
                uiState = shellUiState,
                onPairClick = onPairClick,
            )
        }
    }
}
