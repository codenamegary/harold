package server.agent.android.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import android.app.Application
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import server.agent.android.chat.AddWorkspaceScreen
import server.agent.android.chat.AddWorkspaceViewModel
import server.agent.android.chat.AddWorkspaceViewModelFactory
import server.agent.android.chat.ChatScreen
import server.agent.android.chat.ChatViewModel
import server.agent.android.chat.ChatViewModelFactory
import server.agent.android.chat.HandlerVoiceDictationRestartScheduler
import server.agent.android.chat.VoiceDictationController
import server.agent.android.chat.VoskSpeechRecognitionClient
import server.agent.android.chat.CreateSessionScreen
import server.agent.android.chat.SessionsScreen
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
    val application = LocalContext.current.applicationContext as Application
    val voiceDictationController = remember(application) {
        VoiceDictationController(
            speechClient = VoskSpeechRecognitionClient(application),
            restartScheduler = HandlerVoiceDictationRestartScheduler(),
        )
    }
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
                    activeSessionTracker = appContainer.activeSessionTracker,
                    sessionForegroundCoordinator = appContainer.sessionForegroundCoordinator,
                    openSessionRequests = appContainer.openSessionRequests,
                    voiceDictationController = voiceDictationController,
                ),
            )
            val chatUiState by chatViewModel.uiState.collectAsState()
            val lifecycleOwner = LocalLifecycleOwner.current

            DisposableEffect(lifecycleOwner, chatViewModel) {
                val observer = LifecycleEventObserver { _, event ->
                    if (event == Lifecycle.Event.ON_RESUME) {
                        chatViewModel.onResume()
                    }
                }
                lifecycleOwner.lifecycle.addObserver(observer)
                onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
            }

            ChatScreen(
                uiState = chatUiState,
                onSessionSelectorClick = chatViewModel::showPicker,
                onDismissSessionMenu = chatViewModel::hidePicker,
                onWorkspacesClick = { navController.navigate(Routes.Workspaces) },
                onSessionClick = chatViewModel::selectSession,
                onSeeAllSessionsClick = {
                    chatViewModel.openSessionsList()
                    navController.navigate(Routes.Sessions)
                },
                onCreateClick = {
                    chatViewModel.hidePicker()
                    chatViewModel.showCreateDialog()
                    navController.navigate(Routes.CreateSession)
                },
                onComposerTextChanged = chatViewModel::onComposerTextChanged,
                onComposerSubmit = chatViewModel::submitComposerPrompt,
                onComposerCancel = chatViewModel::submitCancel,
                onPermissionOptionSelect = chatViewModel::submitPermissionOption,
                onExtensionReplyChanged = chatViewModel::onExtensionReplyChanged,
                onExtensionReply = chatViewModel::submitExtensionReply,
                onExtensionSkip = chatViewModel::skipExtension,
                onNotificationPermissionResult = chatViewModel::onNotificationPermissionResult,
                onDismissNotificationPermissionPrompt = chatViewModel::dismissNotificationPermissionPrompt,
                onVoiceDictationOpen = chatViewModel::openVoiceDictation,
                onRecordAudioPermissionResult = chatViewModel::onRecordAudioPermissionResult,
                onVoiceDictationToggleListening = chatViewModel::toggleVoiceDictationListening,
                onVoiceDictationStartOver = chatViewModel::startOverVoiceDictation,
                onVoiceDictationCancel = chatViewModel::cancelVoiceDictation,
                onVoiceDictationConfirm = chatViewModel::confirmVoiceDictation,
                onAuthSignIn = chatViewModel::onAuthSignIn,
                onAuthConfirm = chatViewModel::onAuthConfirm,
                onAuthCancel = chatViewModel::onAuthCancel,
                onAuthLogout = chatViewModel::onAuthLogout,
                onDisconnectFromServer = chatViewModel::disconnectFromServer,
            )
        }

        composable(Routes.Sessions) { sessionsEntry ->
            val chatEntry = remember(sessionsEntry) {
                navController.getBackStackEntry(Routes.Chat)
            }
            val chatViewModel: ChatViewModel = viewModel(
                viewModelStoreOwner = chatEntry,
                factory = ChatViewModelFactory(
                    savedStateHandle = chatEntry.savedStateHandle,
                    sessionGateway = appContainer.sessionGateway,
                    connectionGateway = appContainer.connectionGateway,
                    operatorRepository = appContainer.operatorRepository,
                    navigationPreferences = appContainer.navigationPreferences,
                    activeSessionTracker = appContainer.activeSessionTracker,
                    sessionForegroundCoordinator = appContainer.sessionForegroundCoordinator,
                    openSessionRequests = appContainer.openSessionRequests,
                    voiceDictationController = voiceDictationController,
                ),
            )
            val chatUiState by chatViewModel.uiState.collectAsState()

            SessionsScreen(
                uiState = chatUiState,
                onBack = { navController.popBackStack() },
                onSearchChanged = chatViewModel::onSessionsSearchChanged,
                onSessionClick = { row ->
                    chatViewModel.selectSessionFromList(row)
                    navController.popBackStack()
                },
                onDeleteSession = chatViewModel::deleteSession,
                onCreateClick = {
                    chatViewModel.showCreateDialog()
                    navController.navigate(Routes.CreateSession)
                },
            )
        }

        composable(Routes.CreateSession) { createEntry ->
            val chatEntry = remember(createEntry) {
                navController.getBackStackEntry(Routes.Chat)
            }
            val chatViewModel: ChatViewModel = viewModel(
                viewModelStoreOwner = chatEntry,
                factory = ChatViewModelFactory(
                    savedStateHandle = chatEntry.savedStateHandle,
                    sessionGateway = appContainer.sessionGateway,
                    connectionGateway = appContainer.connectionGateway,
                    operatorRepository = appContainer.operatorRepository,
                    navigationPreferences = appContainer.navigationPreferences,
                    activeSessionTracker = appContainer.activeSessionTracker,
                    sessionForegroundCoordinator = appContainer.sessionForegroundCoordinator,
                    openSessionRequests = appContainer.openSessionRequests,
                    voiceDictationController = voiceDictationController,
                ),
            )
            val chatUiState by chatViewModel.uiState.collectAsState()
            var createFormOpened by remember { mutableStateOf(false) }

            LaunchedEffect(chatUiState.createDialogVisible) {
                if (chatUiState.createDialogVisible) {
                    createFormOpened = true
                } else if (createFormOpened) {
                    navController.popBackStack()
                }
            }

            CreateSessionScreen(
                createState = chatUiState.createState,
                onBack = {
                    // Pop once via LaunchedEffect when createDialogVisible flips false.
                    chatViewModel.hideCreateDialog()
                },
                onWorkspaceChanged = chatViewModel::onCreateWorkspaceChanged,
                onAgentChanged = chatViewModel::onCreateAgentChanged,
                onSubmit = chatViewModel::confirmNewSession,
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
            val lifecycleOwner = LocalLifecycleOwner.current

            DisposableEffect(lifecycleOwner, workspacesViewModel) {
                val observer = LifecycleEventObserver { _, event ->
                    if (event == Lifecycle.Event.ON_RESUME) {
                        workspacesViewModel.refresh()
                    }
                }
                lifecycleOwner.lifecycle.addObserver(observer)
                onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
            }

            WorkspacesScreen(
                uiState = workspacesUiState,
                onBack = { navController.popBackStack() },
                onAddClick = { navController.navigate(Routes.AddWorkspace) },
            )
        }

        composable(Routes.AddWorkspace) {
            val addWorkspaceViewModel: AddWorkspaceViewModel = viewModel(
                factory = AddWorkspaceViewModelFactory(
                    sessionGateway = appContainer.sessionGateway,
                    operatorRepository = appContainer.operatorRepository,
                ),
            )
            val addWorkspaceUiState by addWorkspaceViewModel.uiState.collectAsState()

            AddWorkspaceScreen(
                uiState = addWorkspaceUiState,
                onBack = { navController.popBackStack() },
                onNameChanged = addWorkspaceViewModel::onNameChanged,
                onRootChanged = addWorkspaceViewModel::onRootChanged,
                onFolderChanged = addWorkspaceViewModel::onFolderChanged,
                onFolderQueryChanged = addWorkspaceViewModel::onFolderQueryChanged,
                onSubmit = addWorkspaceViewModel::submit,
                onCreated = { navController.popBackStack() },
            )
        }
    }
}
