package server.agent.android.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import server.agent.android.di.AppContainer
import server.agent.android.pairing.PairingScreen
import server.agent.android.pairing.PairingViewModel
import server.agent.android.pairing.PairingViewModelFactory
import server.agent.android.shell.ShellScreen
import server.agent.android.shell.ShellViewModel
import server.agent.android.shell.ShellViewModelFactory

@Composable
fun AppNavHost(
    appContainer: AppContainer,
) {
    val navController = rememberNavController()
    val shellViewModel: ShellViewModel = viewModel(
        factory = ShellViewModelFactory(appContainer),
    )
    val shellUiState by shellViewModel.uiState.collectAsState()

    NavHost(
        navController = navController,
        startDestination = Routes.Shell,
    ) {
        composable(Routes.Shell) {
            ShellScreen(
                uiState = shellUiState,
                onPairClick = {
                    shellViewModel.onPairClick {
                        navController.navigate(Routes.Pairing)
                    }
                },
            )
        }

        composable(Routes.Pairing) {
            val pairingViewModel: PairingViewModel = viewModel(
                factory = PairingViewModelFactory(
                    pairingCoordinator = appContainer.pairingCoordinator,
                    payloadParser = appContainer.pairingPayloadParser,
                    deviceNameProvider = appContainer.deviceNameProvider,
                ),
            )
            val pairingUiState by pairingViewModel.uiState.collectAsState()

            LaunchedEffect(pairingUiState.completed) {
                if (pairingUiState.completed) {
                    navController.popBackStack()
                }
            }

            PairingScreen(
                uiState = pairingUiState,
                onManualEntryClick = pairingViewModel::showManualEntry,
                onScannerClick = pairingViewModel::showScanner,
                onEndpointChanged = pairingViewModel::onEndpointChanged,
                onCodeChanged = pairingViewModel::onCodeChanged,
                onSubmitManual = pairingViewModel::submitManualPairing,
                onQrScanned = pairingViewModel::onQrScanned,
                onBack = { navController.popBackStack() },
            )
        }
    }
}
