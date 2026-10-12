package harold.android.navigation

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import harold.android.chat.AddWorkspaceScreen
import harold.android.chat.AddWorkspaceViewModel
import harold.android.chat.ChatScreen
import harold.android.chat.ChatViewModel
import harold.android.chat.CreateSessionScreen
import harold.android.chat.CreateSessionViewModel
import harold.android.chat.SessionsScreen
import harold.android.chat.SessionsViewModel
import harold.android.chat.WorkspacesScreen
import harold.android.chat.WorkspacesViewModel
import harold.android.chat.composer.ComposerConfigActions
import harold.android.pairing.PairingScreen
import harold.android.pairing.PairingViewModel
import harold.android.shell.ShellScreen
import harold.android.shell.ShellViewModel

@Composable
fun AppNavHost(
    navigator: Navigator,
) {
    val shellViewModel: ShellViewModel = hiltViewModel()
    val shellUiState by shellViewModel.uiState.collectAsStateWithLifecycle()
    val activity = LocalActivity.current

    NavigationFrame(navigator = navigator) {
        NavDisplay(
            backStack = navigator.backStack,
            onBack = {
                if (!navigator.goBack()) {
                    activity?.finish()
                }
            },
            entryDecorators = listOf(
                rememberSaveableStateHolderNavEntryDecorator(),
                rememberViewModelStoreNavEntryDecorator(),
            ),
            entryProvider = entryProvider {
                entry<Shell> {
                    ShellScreen(
                        uiState = shellUiState,
                        onPairClick = shellViewModel::onPairClick,
                        onRetryClick = shellViewModel::onRetryClick,
                    )
                }

                entry<Pairing> {
                    val pairingViewModel: PairingViewModel = hiltViewModel()
                    val pairingUiState by pairingViewModel.uiState.collectAsStateWithLifecycle()

                    PairingScreen(
                        uiState = pairingUiState,
                        onManualEntryClick = pairingViewModel::showManualEntry,
                        onScannerClick = pairingViewModel::showScanner,
                        onEndpointChanged = pairingViewModel::onEndpointChanged,
                        onCodeChanged = pairingViewModel::onCodeChanged,
                        onSubmitManual = pairingViewModel::submitManualPairing,
                        onQrScanned = pairingViewModel::onQrScanned,
                        onBack = { navigator.goBack() },
                    )
                }

                entry<Chat> {
                    val chatViewModel: ChatViewModel = hiltViewModel()
                    val chatUiState by chatViewModel.uiState.collectAsStateWithLifecycle()
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
                        composerState = chatViewModel.composerState,
                        composerActions = remember(chatViewModel) {
                            ComposerConfigActions(
                                onModelPick = chatViewModel::onModelPick,
                                onModeCycle = chatViewModel::onModeCycle,
                                onThinkingCycle = chatViewModel::onThinkingCycle,
                            )
                        },
                        onAttachmentsPicked = chatViewModel::onAttachmentsPicked,
                        onRemoveAttachment = chatViewModel::removeAttachment,
                        onSessionSelectorClick = chatViewModel::showPicker,
                        onDismissSessionMenu = chatViewModel::hidePicker,
                        onWorkspacesClick = navigator::openWorkspaces,
                        onSessionClick = chatViewModel::selectSession,
                        onSeeAllSessionsClick = {
                            chatViewModel.hidePicker()
                            navigator.openSessions()
                        },
                        onCreateClick = {
                            chatViewModel.hidePicker()
                            navigator.openCreateSession()
                        },
                        onComposerTextChanged = chatViewModel::onComposerTextChanged,
                        onComposerEdit = chatViewModel::onComposerEdit,
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
                        onVoiceDictationExpand = chatViewModel::expandVoiceDictation,
                        onVoiceDictationCollapse = chatViewModel::collapseVoiceDictation,
                        onVoiceSubmit = chatViewModel::submitVoicePrompt,
                        onVoiceCommandToggle = chatViewModel::toggleVoiceCommandList,
                        onVoiceCommandDismiss = chatViewModel::dismissVoiceCommandList,
                        onVoiceCommandPick = chatViewModel::pickVoiceCommand,
                        onComposerCommandPick = chatViewModel::pickComposerCommand,
                        onAuthSignIn = chatViewModel::onAuthSignIn,
                        onAuthConfirm = chatViewModel::onAuthConfirm,
                        onAuthCancel = chatViewModel::onAuthCancel,
                        onAuthLogout = chatViewModel::onAuthLogout,
                        onDisconnectFromServer = chatViewModel::disconnectFromServer,
                    )
                }

                entry<Sessions> {
                    val sessionsViewModel: SessionsViewModel = hiltViewModel()
                    val sessionsUiState by sessionsViewModel.uiState.collectAsStateWithLifecycle()

                    SessionsScreen(
                        uiState = sessionsUiState,
                        onBack = { navigator.goBack() },
                        onSearchChanged = sessionsViewModel::onSearchChanged,
                        onSessionClick = sessionsViewModel::select,
                        onDeleteSession = sessionsViewModel::delete,
                        onCreateClick = navigator::openCreateSession,
                    )
                }

                entry<CreateSession> {
                    val createSessionViewModel: CreateSessionViewModel = hiltViewModel()
                    val createState by createSessionViewModel.uiState.collectAsStateWithLifecycle()

                    CreateSessionScreen(
                        createState = createState,
                        onBack = { navigator.goBack() },
                        onWorkspaceChanged = createSessionViewModel::onWorkspaceChanged,
                        onAgentChanged = createSessionViewModel::onAgentChanged,
                        onSubmit = createSessionViewModel::submit,
                    )
                }

                entry<Workspaces> {
                    val workspacesViewModel: WorkspacesViewModel = hiltViewModel()
                    val workspacesUiState by workspacesViewModel.uiState.collectAsStateWithLifecycle()
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
                        onBack = { navigator.goBack() },
                        onAddClick = navigator::openAddWorkspace,
                    )
                }

                entry<AddWorkspace> {
                    val addWorkspaceViewModel: AddWorkspaceViewModel = hiltViewModel()
                    val addWorkspaceUiState by addWorkspaceViewModel.uiState.collectAsStateWithLifecycle()

                    AddWorkspaceScreen(
                        uiState = addWorkspaceUiState,
                        onBack = { navigator.goBack() },
                        onNameChanged = addWorkspaceViewModel::onNameChanged,
                        onRootChanged = addWorkspaceViewModel::onRootChanged,
                        onFolderChanged = addWorkspaceViewModel::onFolderChanged,
                        onFolderQueryChanged = addWorkspaceViewModel::onFolderQueryChanged,
                        onSubmit = addWorkspaceViewModel::submit,
                    )
                }
            },
        )
    }
}

@Composable
fun NavigationFrame(
    navigator: Navigator,
    destinations: @Composable () -> Unit,
) {
    if (navigator.backStack.isEmpty()) {
        StartSplash()
    } else {
        destinations()
    }
}

@Composable
fun StartSplash() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("start_splash"),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}
