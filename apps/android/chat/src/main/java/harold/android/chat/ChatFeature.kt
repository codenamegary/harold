package harold.android.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.EntryProviderScope
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import harold.android.chat.composer.ComposerConfigActions
import harold.android.di.PreviewDispatcher
import harold.android.navigation.AppRoute
import harold.android.navigation.Chat
import harold.android.navigation.CreateSession
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.Navigator
import harold.android.navigation.Sessions
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

class ChatEntryProvider @Inject constructor() : FeatureEntryProvider {
    override fun register(scope: EntryProviderScope<AppRoute>, navigator: Navigator) {
        scope.entry<Chat> {
            val viewModel: ChatViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            ResumeChat(viewModel)
            ChatScreen(
                uiState = uiState,
                composerState = viewModel.composerState,
                composerActions = remember(viewModel) {
                    ComposerConfigActions(
                        onModelPick = viewModel::onModelPick,
                        onModeCycle = viewModel::onModeCycle,
                        onThinkingCycle = viewModel::onThinkingCycle,
                    )
                },
                onAttachmentsPicked = viewModel::onAttachmentsPicked,
                onRemoveAttachment = viewModel::removeAttachment,
                onSessionSelectorClick = viewModel::showPicker,
                onDismissSessionMenu = viewModel::hidePicker,
                onWorkspacesClick = navigator::openWorkspaces,
                onSessionClick = viewModel::selectSession,
                onSeeAllSessionsClick = {
                    viewModel.hidePicker()
                    navigator.openSessions()
                },
                onCreateClick = {
                    viewModel.hidePicker()
                    navigator.openCreateSession()
                },
                onComposerTextChanged = viewModel::onComposerTextChanged,
                onComposerEdit = viewModel::onComposerEdit,
                onComposerSubmit = viewModel::submitComposerPrompt,
                onComposerCancel = viewModel::submitCancel,
                onPermissionOptionSelect = viewModel::submitPermissionOption,
                onExtensionReplyChanged = viewModel::onExtensionReplyChanged,
                onExtensionReply = viewModel::submitExtensionReply,
                onExtensionSkip = viewModel::skipExtension,
                onNotificationPermissionResult = viewModel::onNotificationPermissionResult,
                onDismissNotificationPermissionPrompt = viewModel::dismissNotificationPermissionPrompt,
                onVoiceDictationOpen = viewModel::openVoiceDictation,
                onRecordAudioPermissionResult = viewModel::onRecordAudioPermissionResult,
                onVoiceDictationToggleListening = viewModel::toggleVoiceDictationListening,
                onVoiceDictationStartOver = viewModel::startOverVoiceDictation,
                onVoiceDictationCancel = viewModel::cancelVoiceDictation,
                onVoiceDictationConfirm = viewModel::confirmVoiceDictation,
                onVoiceDictationExpand = viewModel::expandVoiceDictation,
                onVoiceDictationCollapse = viewModel::collapseVoiceDictation,
                onVoiceSubmit = viewModel::submitVoicePrompt,
                onVoiceCommandToggle = viewModel::toggleVoiceCommandList,
                onVoiceCommandDismiss = viewModel::dismissVoiceCommandList,
                onVoiceCommandPick = viewModel::pickVoiceCommand,
                onComposerCommandPick = viewModel::pickComposerCommand,
                onAuthSignIn = viewModel::onAuthSignIn,
                onAuthConfirm = viewModel::onAuthConfirm,
                onAuthCancel = viewModel::onAuthCancel,
                onAuthLogout = viewModel::onAuthLogout,
                onDisconnectFromServer = viewModel::disconnectFromServer,
                onPairAnotherHarold = navigator::openPairing,
                onSavedHarolds = navigator::openSavedHarolds,
            )
        }

        scope.entry<Sessions> {
            val viewModel: SessionsViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            SessionsScreen(
                uiState = uiState,
                onBack = { navigator.goBack() },
                onSearchChanged = viewModel::onSearchChanged,
                onSessionClick = viewModel::select,
                onDeleteSession = viewModel::delete,
                onCreateClick = navigator::openCreateSession,
                onHaroldFilter = viewModel::onHaroldFilter,
            )
        }

        scope.entry<CreateSession> {
            val viewModel: CreateSessionViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            CreateSessionScreen(
                createState = uiState,
                onBack = { navigator.goBack() },
                onWorkspaceChanged = viewModel::onWorkspaceChanged,
                onAgentChanged = viewModel::onAgentChanged,
                onSubmit = viewModel::submit,
                onNewWorkspaceClick = viewModel::openNewWorkspace,
            )
        }
    }
}

@Composable
private fun ResumeChat(viewModel: ChatViewModel) {
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> viewModel.onResume()
                Lifecycle.Event.ON_STOP -> viewModel.onBackground()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatFeatureModule {
    @Binds
    @IntoSet
    abstract fun entryProvider(impl: ChatEntryProvider): FeatureEntryProvider

    @Binds
    @Singleton
    abstract fun sessionCommands(impl: DefaultSessionCommands): SessionCommands

    companion object {
        @Provides
        @PreviewDispatcher
        fun previewDispatcher(): CoroutineDispatcher = Dispatchers.Default
    }
}
