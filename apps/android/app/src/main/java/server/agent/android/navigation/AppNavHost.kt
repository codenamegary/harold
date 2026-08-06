package server.agent.android.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import server.agent.android.chat.ChatScreen
import server.agent.android.chat.ChatViewModel
import server.agent.android.chat.ChatViewModelFactory
import server.agent.android.chat.WorkspacesScreen
import server.agent.android.chat.WorkspacesViewModel
import server.agent.android.chat.WorkspacesViewModelFactory
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
        factory = ShellViewModelFactory(
            sessionGateway = appContainer.sessionGateway,
            connectionGateway = appContainer.connectionGateway,
            agentApi = appContainer.agentApi,
        ),
    )
    val shellUiState by shellViewModel.uiState.collectAsState()
    val showShell by shellViewModel.showShell.collectAsState()

    LaunchedEffect(showShell) {
        if (showShell) {
            navController.navigate(Routes.Shell) {
                popUpTo(0) { inclusive = true }
            }
        } else {
            navController.navigate(Routes.Chat) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

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
                onRetryClick = shellViewModel::onRetryClick,
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

        composable(Routes.Chat) { backStackEntry ->
            val chatViewModel: ChatViewModel = viewModel(
                viewModelStoreOwner = backStackEntry,
                factory = ChatViewModelFactory(
                    savedStateHandle = backStackEntry.savedStateHandle,
                    sessionGateway = appContainer.sessionGateway,
                    connectionGateway = appContainer.connectionGateway,
                    operatorRepository = appContainer.operatorRepository,
                    navigationPreferences = appContainer.navigationPreferences,
                    eventStreamFactory = appContainer.eventStreamFactory,
                ),
            )
            val chatUiState by chatViewModel.uiState.collectAsState()

            ChatScreen(
                uiState = chatUiState,
                onSessionSelectorClick = chatViewModel::showPicker,
                onWorkspacesClick = { navController.navigate(Routes.Workspaces) },
                onDismissPicker = chatViewModel::hidePicker,
                onSessionClick = chatViewModel::selectSession,
                onCreateClick = {
                    chatViewModel.hidePicker()
                    chatViewModel.showCreateDialog()
                },
                onDismissCreate = chatViewModel::hideCreateDialog,
                onCreateWorkspaceChanged = chatViewModel::onCreateWorkspaceChanged,
                onCreateAgentChanged = chatViewModel::onCreateAgentChanged,
                onCreatePromptChanged = chatViewModel::onCreatePromptChanged,
                onCreateSubmit = chatViewModel::submitCreateSession,
                onComposerTextChanged = chatViewModel::onComposerTextChanged,
                onComposerSubmit = chatViewModel::submitComposerPrompt,
            )
        }

        composable(Routes.Workspaces) {
            val workspacesViewModel: WorkspacesViewModel = viewModel(
                factory = WorkspacesViewModelFactory(
                    sessionGateway = appContainer.sessionGateway,
                    operatorRepository = appContainer.operatorRepository,
                ),
            )
            val workspacesUiState by workspacesViewModel.uiState.collectAsState()

            WorkspacesScreen(
                uiState = workspacesUiState,
                onBack = { navController.popBackStack() },
            )
        }
    }
}
