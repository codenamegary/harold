package harold.android.chat

import androidx.annotation.VisibleForTesting
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.chat.auth.AgentAuthController
import harold.android.chat.composer.ComposerConfigUi
import harold.android.chat.composer.SessionConfigWriter
import harold.android.chat.composer.completeSlashCommand
import harold.android.chat.composer.supportsFileAttachments
import harold.android.chat.composer.supportsImageAttachments
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.SelectOption
import harold.android.contracts.SessionState
import harold.android.contracts.Workspace
import harold.android.contracts.catalogSessionKey
import harold.android.contracts.parseConfigOptions
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.forgetConnection
import harold.android.credentials.settleAfterForget
import harold.android.database.session.SessionListItem
import harold.android.database.session.SessionRepository
import harold.android.di.PreviewDispatcher
import harold.android.foreground.ActiveSessionSnapshot
import harold.android.foreground.MarkedUserInput
import harold.android.foreground.PermissionAttentionNotifier
import harold.android.foreground.SessionAttentionMarks
import harold.android.foreground.userInputKind
import harold.android.foreground.userInputLabel
import harold.android.foreground.userInputNotification
import harold.android.foreground.ActiveSessionTracker
import harold.android.foreground.OpenSessionRequests
import harold.android.foreground.SessionForegroundCoordinator
import harold.android.live.AcpTranscriptState
import harold.android.live.Elicitation
import harold.android.live.ElicitationDraft
import harold.android.live.SessionOwner
import harold.android.live.WatchTarget
import harold.android.live.SessionSnapshot
import harold.android.live.emptyAcpTranscript
import harold.android.live.toContent
import harold.android.navigation.LastSessionSelection
import harold.android.navigation.NavigationPreferences
import harold.android.navigation.Navigator
import harold.android.navigation.SessionPreferences
import harold.android.network.AttachmentApi
import harold.android.network.GitApi
import harold.android.network.SessionConfigApi
import harold.android.network.apiErrorMessage
import harold.android.credentials.SavedConnection
import harold.android.session.ConnectionHealth
import harold.android.session.ConnectionStatus
import harold.android.session.Connections
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import harold.android.stream.StreamStatus
import harold.android.ui.promptinput.PromptEdit
import harold.android.ui.promptinput.applyEdit
import harold.android.user.UserRepository
import harold.android.voice.VoiceDictationController
import harold.android.voice.VoiceDictationUiState
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val connectionGateway: ConnectionGateway,
    private val sessionOwner: SessionOwner,
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val connectionRepository: ConnectionRepository,
    private val attachmentApi: AttachmentApi,
    private val configApi: SessionConfigApi,
    private val gitApi: GitApi,
    private val navigationPreferences: NavigationPreferences,
    private val sessionPreferences: SessionPreferences,
    private val activeSessionTracker: ActiveSessionTracker? = null,
    private val sessionForegroundCoordinator: SessionForegroundCoordinator? = null,
    private val openSessionRequests: OpenSessionRequests? = null,
    @get:VisibleForTesting
    val voiceDictationController: VoiceDictationController,
    @PreviewDispatcher private val previewDispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val navigator: Navigator,
    private val sessionCommands: SessionCommands,
    private val connections: Connections? = null,
    private val sessionAttention: SessionAttentionMarks? = null,
    private val permissionNotifier: PermissionAttentionNotifier? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val configWriter = SessionConfigWriter(configApi, viewModelScope)

    /**
     * The agent-auth conversation lives in its own module. Its panel slice is
     * mirrored into [ChatUiState.agentAuth] by the collector in [init], so the
     * screen observes one atomic state stream.
     */
    private val agentAuth = AgentAuthController(
        userRepository = userRepository,
        scope = viewModelScope,
        origin = ::selectedOrActiveOrigin,
        selectedAgent = { _uiState.value.selectedSession?.agentId },
    )

    /**
     * Session-scoped actions must follow the selected session's Harold. The
     * active connection is only the fallback for legacy single-Harold flows.
     */
    private fun selectedSessionOrigin(): String? =
        _uiState.value.selectedSession?.connectionId?.takeIf { origin -> origin.isNotEmpty() }

    private fun selectedOrActiveOrigin(): String? =
        selectedSessionOrigin()
            ?: (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId

    /**
     * The composer's text and caret. The prompt input paints its tokens from
     * these, so they are the source of truth; [ChatUiState.composerText]
     * mirrors the text for everything that reads state instead of the field.
     */
    val composerState = TextFieldState()

    private var workspaceByPath: Map<String, WorkspaceRow> = emptyMap()
    private var agentLabels: Map<AgentId, String> = emptyMap()
    /** Live handshake results, keyed by the session that produced them. */
    private var agentCapabilities: Map<String, AgentCapabilityInventory?> = emptyMap()
    private var liveSessions: List<SessionListItem> = emptyList()
    private var savedConnections: List<SavedConnection> = emptyList()
    private var activeOrigin: String? = null
    private var metadataLoaded = false
    private val unreachableOrigins = mutableSetOf<String>()
    private val refreshMutex = Mutex()
    private var restoreJob: Job? = null
    private val transcriptMemory = mutableMapOf<String, AcpTranscriptState>()
    private var watchedOrigin: String? = null
    private var keepRestoredPermission: Boolean = false
    private var keepRestoredElicitation: Boolean = false
    private var openElicitationSheetOnArrival: Boolean = false
    private var attachmentLocalIdCounter: Int = 0
    private var catalog: List<SessionRow> = emptyList()
    private val titlePulledSessionIds = mutableSetOf<String>()
    private var lastLiveWatchKey: String? = null
    private var lastAuthRequired: Boolean = false
    private var changesBadgeJob: Job? = null
    private var changesBadgeKey: String? = null
    private var pendingModelApply: PendingModelApply? = null
    private var pendingModelValue: String? = null
    private var pendingModelValueLoaded: Boolean = false
    private var modelSyncTimeoutJob: Job? = null
    private val appliedModelSessions = mutableSetOf<String>()

    init {
        voiceDictationController.onStateChanged = ::syncVoiceDictationState
        syncVoiceDictationState(voiceDictationController.state)

        viewModelScope.launch {
            snapshotFlow { composerState.text.toString() }.collect { text ->
                _uiState.update { current ->
                    current.copy(
                        composerText = text,
                        // Typing dismisses a stale error. Clearing the field
                        // after a send must not, because the failure that sets
                        // the error can land after the field is empty.
                        composerError = if (text.isEmpty()) current.composerError else null,
                    )
                }
            }
        }

        savedStateHandle.get<String>(KEY_SELECTED_SESSION_ID)?.let { sessionKey ->
            viewModelScope.launch {
                selectSessionLocally(sessionKey)
            }
        }

        viewModelScope.launch {
            sessionRepository.observeSessions().collect { sessions ->
                liveSessions = sessions
                if (metadataLoaded) {
                    publishLiveSessions()
                }
            }
        }

        viewModelScope.launch {
            sessionOwner.connectionState.collect { state ->
                val status = state.status
                val banner = when (status) {
                    StreamStatus.Idle -> null
                    StreamStatus.Connecting -> "Connecting…"
                    StreamStatus.Live -> null
                    is StreamStatus.Reconnecting -> "Reconnecting (attempt ${status.attempt})"
                    is StreamStatus.AuthFailed -> "Auth failed"
                    is StreamStatus.TransportError -> status.message
                }
                val connectionInProgress =
                    status is StreamStatus.Connecting || status is StreamStatus.Reconnecting
                _uiState.update { current ->
                    current.copy(
                        connectionBanner = banner,
                        connectionInProgress = connectionInProgress,
                    )
                }
                if (state.status is StreamStatus.Live) {
                    refreshLiveCapabilities()
                }
            }
        }

        viewModelScope.launch {
            sessionOwner.sessionStatus.collect { status ->
                _uiState.update { current -> current.copy(sessionStatus = status) }
            }
        }

        viewModelScope.launch {
            sessionOwner.snapshot.collect(::applyLiveSnapshot)
        }

        viewModelScope.launch {
            sessionOwner.sessionTitles.collect(::applySessionTitles)
        }

        viewModelScope.launch {
            sessionOwner.promptCompletions.collect { pullSelectedSessionTitle() }
        }

        viewModelScope.launch {
            configWriter.state.collect { config ->
                _uiState.update { current -> current.copy(composerConfig = config) }
            }
        }

        viewModelScope.launch {
            configWriter.settled.collect { settled ->
                if (!settled.isModel) return@collect
                val model = (settled.value as? ConfigValue.Text)?.value ?: return@collect
                sessionPreferences.saveLastModel(
                    connectionId = settled.connectionId,
                    agentId = settled.agentId,
                    model = model,
                )
                finishModelSync(
                    modelSyncKey(settled.connectionId, settled.agentId, settled.sessionId),
                )
            }
        }

        viewModelScope.launch {
            agentAuth.state.collect { auth ->
                _uiState.update { current -> current.copy(agentAuth = auth) }
            }
        }

        viewModelScope.launch {
            connectionGateway.activeConnection.collect { active ->
                if (active is ActiveConnectionState.Active) {
                    sessionForegroundCoordinator?.setConnectionId(
                        selectedSessionOrigin() ?: active.connectionId,
                    )
                    _uiState.value.selectedSession?.let { selected ->
                        sessionOwner.watch(selected.agentId, selected.sessionId)
                    }
                    refreshCatalog()
                } else {
                    sessionForegroundCoordinator?.setConnectionId(null)
                    sessionOwner.watch(null, null)
                    _uiState.update { current ->
                        current.copy(
                            availableCommands = emptyList(),
                            composerConfig = ComposerConfigUi(),
                        )
                    }
                }
            }
        }

        sessionForegroundCoordinator?.let { coordinator ->
            viewModelScope.launch {
                coordinator.state.collect { foreground ->
                    _uiState.update { current ->
                        current.copy(notificationPermissionDenied = foreground.permissionDenied)
                    }
                }
            }
        }

        openSessionRequests?.let { requests ->
            viewModelScope.launch {
                requests.sessionIds.collect { sessionId ->
                    openSessionFromNotification(sessionId)
                }
            }
        }

        connections?.let { connections ->
            viewModelScope.launch {
                connections.connections.collect(::onHaroldLinks)
            }
        }

        viewModelScope.launch {
            sessionCommands.commands.collect { command ->
                when (command) {
                    is SessionCommand.Open -> activateSession(command.row)
                    is SessionCommand.Created -> openCreatedSession(command)
                    is SessionCommand.Pending -> openPendingSession(
                        workspace = command.workspace,
                        agentId = command.agentId,
                    )
                    is SessionCommand.Deleted -> dropSession(command.row)
                }
            }
        }
    }

    fun onResume() {
        sessionOwner.onForeground()
        refreshChangesBadge()
        val origin = selectedOrActiveOrigin() ?: return
        sessionForegroundCoordinator?.setConnectionId(origin)
        viewModelScope.launch {
            refreshCatalog()
        }
    }

    fun onBackground() {
        sessionOwner.onBackground()
    }

    private fun refreshChangesBadge() {
        val selected = _uiState.value.selectedSession
        val origin = selectedOrActiveOrigin()
        val path = selected?.worktreePath ?: selected?.cwd.orEmpty()
        if (
            selected == null ||
            origin == null ||
            selected.sessionId.isEmpty() ||
            path.isEmpty()
        ) {
            clearChangesBadge()
            return
        }

        val key = "${selected.id}|$origin|$path"
        if (changesBadgeKey == key && changesBadgeJob?.isActive == true) {
            return
        }
        changesBadgeKey = key
        changesBadgeJob?.cancel()
        changesBadgeJob = viewModelScope.launch {
            val result = gitApi.getSummary(connectionId = origin, path = path)
            if (changesBadgeKey != key) {
                return@launch
            }
            result.fold(
                onSuccess = { summary ->
                    _uiState.update { current ->
                        if (
                            changesBadgeKey == key &&
                            current.selectedSession?.id == selected.id
                        ) {
                            current.copy(
                                changesAvailable = true,
                                changesBadgeCount = summary.uncommittedFileCount,
                            )
                        } else {
                            current
                        }
                    }
                },
                onFailure = {
                    _uiState.update { current ->
                        if (
                            changesBadgeKey == key &&
                            current.selectedSession?.id == selected.id
                        ) {
                            current.copy(
                                changesAvailable = false,
                                changesBadgeCount = 0,
                            )
                        } else {
                            current
                        }
                    }
                },
            )
        }
    }

    private fun clearChangesBadge() {
        changesBadgeKey = null
        changesBadgeJob?.cancel()
        changesBadgeJob = null
        _uiState.update { current ->
            if (current.changesAvailable || current.changesBadgeCount != 0) {
                current.copy(
                    changesAvailable = false,
                    changesBadgeCount = 0,
                )
            } else {
                current
            }
        }
    }

    fun dismissNotificationPermissionPrompt() {
        sessionForegroundCoordinator?.dismissPermissionPrompt()
        _uiState.update { current -> current.copy(notificationPermissionDenied = false) }
    }

    fun onNotificationPermissionResult(granted: Boolean) {
        sessionForegroundCoordinator?.onPermissionMaybeChanged()
        if (!granted) {
            _uiState.update { current -> current.copy(notificationPermissionDenied = true) }
        }
    }

    fun showPicker() {
        _uiState.update { current ->
            current.copy(
                pickerVisible = true,
                recentSessionsLoading = true,
                recentSessionsError = null,
            )
        }
        viewModelScope.launch {
            refreshCatalog()
            publishRecentSessions()
            _uiState.update { current ->
                current.copy(recentSessionsLoading = false)
            }
        }
    }

    fun hidePicker() {
        _uiState.update { current -> current.copy(pickerVisible = false) }
    }

    fun onComposerTextChanged(text: String) {
        composerState.setTextAndPlaceCursorAtEnd(text)
        _uiState.update { current ->
            current.copy(composerText = text, composerError = null)
        }
    }

    fun onModelPick(value: String) {
        val configId = _uiState.value.composerConfig.model?.id ?: return
        // A pick wins over the remembered model that is still on its way.
        pendingModelApply?.let { pending -> finishModelSync(pending.key) }
        configWriter.set(configId, ConfigValue.Text(value))
    }

    fun onModeCycle(value: ConfigOptionValue) {
        val configId = _uiState.value.composerConfig.mode?.id ?: return
        configWriter.set(configId, ConfigValue.Text(value.value))
    }

    fun onThinkingCycle(value: ConfigOptionValue) {
        val configId = _uiState.value.composerConfig.thinking?.id ?: return
        configWriter.set(configId, ConfigValue.Text(value.value))
    }

    /** Applies a token-aware edit, keeping the caret the edit asked for. */
    fun onComposerEdit(edit: PromptEdit) {
        composerState.applyEdit(edit)
        _uiState.update { current ->
            current.copy(composerText = edit.text, composerError = null)
        }
    }

    private fun clearComposer() {
        composerState.setTextAndPlaceCursorAtEnd("")
    }

    fun openVoiceDictation(hasRecordAudioPermission: Boolean) {
        if (!_uiState.value.composerEnabled) {
            return
        }

        _uiState.update { current ->
            current.copy(voiceCommandPrefix = "", voiceCommandListVisible = false)
        }
        syncVoiceDictationState(
            voiceDictationController.open(
                baseline = composerState.text.toString(),
                hasRecordAudioPermission = hasRecordAudioPermission,
                composerEnabled = _uiState.value.composerEnabled,
            ),
        )
    }

    fun onRecordAudioPermissionResult(granted: Boolean) {
        syncVoiceDictationState(voiceDictationController.onRecordAudioPermissionResult(granted))
    }

    fun toggleVoiceDictationListening() {
        syncVoiceDictationState(voiceDictationController.toggleListening())
    }

    fun startOverVoiceDictation() {
        syncVoiceDictationState(voiceDictationController.startOver())
    }

    fun cancelVoiceDictation() {
        _uiState.update { current ->
            current.copy(voiceCommandPrefix = "", voiceCommandListVisible = false)
        }
        syncVoiceDictationState(voiceDictationController.cancel())
    }

    fun expandVoiceDictation() {
        syncVoiceDictationState(voiceDictationController.expand())
    }

    fun collapseVoiceDictation() {
        syncVoiceDictationState(voiceDictationController.collapse())
    }

    /** Ends dictation and drops the message (prefix plus transcript) into the text composer. */
    fun confirmVoiceDictation() {
        val prefix = _uiState.value.voiceCommandPrefix
        val (_, transcript) = voiceDictationController.finish()
        syncVoiceDictationState(voiceDictationController.state)
        _uiState.update { current ->
            current.copy(voiceCommandPrefix = "", voiceCommandListVisible = false)
        }
        if (transcript != null) {
            onComposerTextChanged(prefix + transcript)
        }
    }

    /** Ends dictation and sends the message (prefix plus transcript) as a prompt. */
    fun submitVoicePrompt() {
        if (_uiState.value.voiceMessage.isBlank()) {
            return
        }
        confirmVoiceDictation()
        submitComposerPrompt()
    }

    fun toggleVoiceCommandList() {
        _uiState.update { current ->
            current.copy(voiceCommandListVisible = !current.voiceCommandListVisible)
        }
    }

    fun dismissVoiceCommandList() {
        _uiState.update { current ->
            current.copy(voiceCommandListVisible = false)
        }
    }

    fun pickVoiceCommand(commandName: String) {
        _uiState.update { current ->
            current.copy(
                voiceCommandPrefix = "/$commandName ",
                voiceCommandListVisible = false,
            )
        }
    }

    fun pickComposerCommand(commandName: String) {
        onComposerEdit(
            completeSlashCommand(
                composerText = composerState.text.toString(),
                selection = composerState.selection,
                commandName = commandName,
            ),
        )
    }

    private fun syncVoiceDictationState(voiceDictation: VoiceDictationUiState) {
        _uiState.update { current -> current.copy(voiceDictation = voiceDictation) }
    }

    private suspend fun openCreatedSession(created: SessionCommand.Created) {
        rememberCreatedConfig(created.response)
        val row = created.response.toSession().toSessionRow(workspaceByPath, agentLabels).copy(
            connectionId = created.connectionId,
            connectionName = created.connectionName,
            connectionColorId = created.connectionColorId,
            connectionIconId = created.connectionIconId,
        )
        markModelApplyPending(row)
        activateSession(row)
        startModelSync()
        refreshCatalog()
    }

    /**
     * The agent refused to create a session until it is signed in. Show its login panel on a
     * row with no session id, and create the session once login succeeds.
     */
    private suspend fun openPendingSession(workspace: WorkspaceRow, agentId: AgentId) {
        if (voiceDictationController.state.visible) {
            syncVoiceDictationState(voiceDictationController.cancel())
        }
        clearComposer()
        clearPersistedSession()
        _uiState.update { current ->
            current.resetSessionScopedState(
                SessionResetKeep(
                    selectedSession = pendingSessionRow(workspace = workspace, agentId = agentId),
                ),
            )
        }
        agentAuth.resetFor(agentId)
        sessionOwner.watch(agentId, null)
        syncActiveSessionsFromUiState()
        agentAuth.hydrate(agentId)
        clearChangesBadge()
    }

    fun submitComposerPrompt() {
        val session = _uiState.value.selectedSession ?: return
        val prompt = composerState.text.toString().trim()

        if (prompt.isEmpty() || !_uiState.value.submitEnabled) {
            return
        }

        val pending = _uiState.value.pendingAttachments
        if (pending.any { it.status == AttachmentUploadStatus.Uploading }) {
            _uiState.update { current ->
                current.copy(composerError = "Waiting for uploads to finish…")
            }
            return
        }
        val failed = pending.filter { it.status == AttachmentUploadStatus.Failed }
        if (failed.isNotEmpty()) {
            _uiState.update { current ->
                current.copy(composerError = "An attachment failed to upload. Retry or remove it.")
            }
            return
        }

        val references = pending.mapNotNull { it.toReference() }

        clearComposer()
        _uiState.update { current ->
            current.copy(
                composerText = "",
                composerSubmitting = false,
                composerError = null,
                pendingAttachments = emptyList(),
            )
        }
        viewModelScope.launch {
            sessionOwner.prompt(prompt, references)
                .onFailure { error ->
                    _uiState.update { current ->
                        current.copy(composerError = error.message ?: "Prompt failed")
                    }
                }
        }
    }

    /** Picker intake: bytes are read by the screen, previews decode off-main. */
    fun onAttachmentsPicked(files: List<AttachmentPick>) {
        val origin = selectedOrActiveOrigin() ?: return
        if (files.isEmpty()) {
            return
        }

        val created = files.map { pick ->
            attachmentLocalIdCounter += 1
            val kind = if (pick.mimeType.startsWith("image/")) AttachmentKind.Image else AttachmentKind.File
            PendingAttachmentUi(
                localId = "att_local_${attachmentLocalIdCounter}",
                name = pick.name,
                size = pick.bytes.size.toLong(),
                kind = kind,
                mimeType = pick.mimeType,
                bytes = pick.bytes,
            )
        }

        _uiState.update { current ->
            current.copy(pendingAttachments = current.pendingAttachments + created)
        }

        for (attachment in created) {
            viewModelScope.launch {
                val preview = kotlinx.coroutines.withContext(previewDispatcher) {
                    decodePreview(attachment.bytes, attachment.kind)
                }
                _uiState.update { current ->
                    current.copy(
                        pendingAttachments = current.pendingAttachments.map { existing ->
                            if (existing.localId == attachment.localId) {
                                existing.copy(preview = preview)
                            } else {
                                existing
                            }
                        },
                    )
                }
            }
            viewModelScope.launch { uploadAttachment(origin, attachment) }
        }
    }

    fun removeAttachment(localId: String) {
        val attachment = _uiState.value.pendingAttachments.find { it.localId == localId } ?: return
        _uiState.update { current ->
            current.copy(
                pendingAttachments = current.pendingAttachments.filter { it.localId != localId },
            )
        }
        if (attachment.status == AttachmentUploadStatus.Ready && attachment.uploadedId != null) {
            viewModelScope.launch {
                val origin = selectedOrActiveOrigin() ?: return@launch
                val session = _uiState.value.selectedSession ?: return@launch
                attachmentApi.deleteAttachment(
                    connectionId = origin,
                    agentId = session.agentId,
                    sessionId = session.sessionId,
                    attachmentId = attachment.uploadedId,
                )
            }
        }
    }

    fun retryAttachment(localId: String) {
        val attachment = _uiState.value.pendingAttachments.find { it.localId == localId } ?: return
        if (attachment.status != AttachmentUploadStatus.Failed) {
            return
        }
        val origin = selectedOrActiveOrigin() ?: return
        _uiState.update { current ->
            current.copy(
                pendingAttachments = current.pendingAttachments.map { existing ->
                    if (existing.localId == localId) {
                        existing.copy(status = AttachmentUploadStatus.Uploading, error = null)
                    } else {
                        existing
                    }
                },
            )
        }
        viewModelScope.launch { uploadAttachment(origin, attachment) }
    }

    private suspend fun uploadAttachment(connectionId: String, attachment: PendingAttachmentUi) {
        val session = _uiState.value.selectedSession?.takeIf { it.sessionId.isNotEmpty() }
        if (session == null) {
            failAttachment(attachment.localId, "No session selected")
            return
        }
        val result = attachmentApi.uploadAttachment(
            connectionId = connectionId,
            request = AttachmentUploadRequest(
                agentId = session.agentId,
                sessionId = session.sessionId,
                fileName = attachment.name,
                mimeType = attachment.mimeType,
                bytes = attachment.bytes,
                kind = attachment.kind,
            ),
        )
        result.fold(
            onSuccess = { descriptor ->
                _uiState.update { current ->
                    current.copy(
                        pendingAttachments = current.pendingAttachments.map { existing ->
                            if (existing.localId == attachment.localId) {
                                existing.copy(
                                    status = AttachmentUploadStatus.Ready,
                                    uploadedPath = descriptor.path,
                                    uploadedId = descriptor.id,
                                )
                            } else {
                                existing
                            }
                        },
                    )
                }
            },
            onFailure = { error -> failAttachment(attachment.localId, apiErrorMessage(error)) },
        )
    }

    private fun failAttachment(localId: String, message: String) {
        _uiState.update { current ->
            current.copy(
                pendingAttachments = current.pendingAttachments.map { existing ->
                    if (existing.localId == localId) {
                        existing.copy(status = AttachmentUploadStatus.Failed, error = message)
                    } else {
                        existing
                    }
                },
            )
        }
    }

    private fun syncAttachmentGating() {
        val session = _uiState.value.selectedSession
        val inventory = session?.let { current ->
            agentCapabilities[catalogSessionKey(current.agentId, current.sessionId)]
        }
        _uiState.update { current ->
            current.copy(
                supportsImageAttachments = supportsImageAttachments(inventory),
                supportsFileAttachments = supportsFileAttachments(inventory),
            )
        }
    }

    /**
     * Reads the live handshake of the selected session. Null until the agent
     * answered `initialize`, so the composer stays text-only until then, and
     * nothing about capabilities is persisted.
     */
    private fun refreshLiveCapabilities() {
        val selected = _uiState.value.selectedSession ?: return
        val connectionId = selected.connectionId.takeIf { it.isNotEmpty() } ?: return
        viewModelScope.launch {
            userRepository.getAgentCapabilities(
                connectionId = connectionId,
                agentId = selected.agentId,
                sessionId = selected.sessionId,
            ).onSuccess { inventory ->
                val key = catalogSessionKey(selected.agentId, selected.sessionId)
                agentCapabilities = agentCapabilities + (key to inventory)
                syncAttachmentGating()
            }
        }
    }

    fun restartAgentAuth() {
        selectedOrActiveOrigin()?.let { origin ->
            _uiState.value.selectedSession?.agentId?.let { agentId ->
                agentAuth.restart(agentId)
            }
        }
    }

    fun logoutAgentAuth() {
        selectedOrActiveOrigin()?.let { origin ->
            _uiState.value.selectedSession?.agentId?.let { agentId ->
                agentAuth.logout(agentId)
            }
        }
    }

    fun submitPermissionOption(optionId: String) {
        val active = _uiState.value.activePermissionRequest ?: return
        if (_uiState.value.permissionUiState.submittingOptionId != null) {
            return
        }

        _uiState.update { current ->
            current.copy(
                permissionUiState = current.permissionUiState.copy(
                    submittingOptionId = optionId,
                    error = null,
                ),
            )
        }
        viewModelScope.launch {
            sessionOwner.replyPermission(requestId = active.id, optionId = optionId)
                .onFailure { error ->
                    _uiState.update { current ->
                        current.copy(
                            permissionUiState = current.permissionUiState.copy(
                                error = error.message ?: "Reply failed",
                            ),
                        )
                    }
                }
        }
    }

    fun openElicitationSheet() {
        _uiState.update { current ->
            current.copy(elicitationUiState = current.elicitationUiState.copy(showSheet = true))
        }
    }

    fun closeElicitationSheet() {
        // Collapsing keeps the draft so reopening the card never loses answers.
        _uiState.update { current ->
            current.copy(elicitationUiState = current.elicitationUiState.copy(showSheet = false))
        }
    }

    fun toggleElicitationRaw() {
        _uiState.update { current ->
            current.copy(
                elicitationUiState = current.elicitationUiState.copy(
                    rawExpanded = !current.elicitationUiState.rawExpanded,
                ),
            )
        }
    }

    fun onElicitationTextChanged(key: String, text: String) = updateElicitationDraft { draft ->
        draft.withText(key, text)
    }

    fun onElicitationSingleSelected(key: String, value: String) = updateElicitationDraft { draft ->
        draft.withSingle(key, value)
    }

    fun onElicitationMultiToggled(key: String, value: String) = updateElicitationDraft { draft ->
        draft.toggleMulti(key, value)
    }

    fun onElicitationBooleanChanged(key: String, value: Boolean) = updateElicitationDraft { draft ->
        draft.withBoolean(key, value)
    }

    fun onElicitationOtherToggled(key: String, selected: Boolean) = updateElicitationDraft { draft ->
        draft.withOtherSelected(key, selected)
    }

    fun onElicitationOtherTextChanged(key: String, text: String) = updateElicitationDraft { draft ->
        draft.withOtherText(key, text)
    }

    fun onElicitationNext() {
        val current = _uiState.value
        val request = current.activeElicitation as? Elicitation.Form ?: return
        val ui = current.elicitationUiState
        when (ui.footerAction(request)) {
            ElicitationFooter.Next -> {
                _uiState.update { state ->
                    state.copy(
                        elicitationUiState = state.elicitationUiState.copy(
                            stepIndex = state.elicitationUiState.stepIndex + 1,
                        ),
                    )
                }
            }
            ElicitationFooter.Review -> {
                _uiState.update { state ->
                    state.copy(
                        elicitationUiState = state.elicitationUiState.copy(review = true),
                    )
                }
            }
            ElicitationFooter.Submit -> submitElicitation()
            ElicitationFooter.Open -> Unit
        }
    }

    fun onElicitationBack() {
        _uiState.update { current ->
            val ui = current.elicitationUiState
            val request = current.activeElicitation as? Elicitation.Form ?: return@update current
            when {
                ui.review -> current.copy(
                    elicitationUiState = ui.copy(
                        review = false,
                        stepIndex = (request.questions.size - 1).coerceAtLeast(0),
                    ),
                )
                ui.stepIndex > 0 -> current.copy(
                    elicitationUiState = ui.copy(stepIndex = ui.stepIndex - 1),
                )
                else -> current
            }
        }
    }

    fun onElicitationEditStep(stepIndex: Int) {
        _uiState.update { current ->
            current.copy(
                elicitationUiState = current.elicitationUiState.copy(
                    review = false,
                    stepIndex = stepIndex,
                ),
            )
        }
    }

    fun submitElicitation() {
        val current = _uiState.value
        val request = current.activeElicitation as? Elicitation.Form ?: return
        if (!current.elicitationUiState.canAdvance(request)) {
            return
        }
        val content = current.elicitationUiState.draft.toContent(request.questions)
        sendElicitationResult(
            requestId = request.requestId,
            result = JsonObject(
                mapOf(
                    "action" to JsonPrimitive("accept"),
                    "content" to content,
                ),
            ),
            action = "accept",
        )
    }

    fun declineElicitation() {
        val request = _uiState.value.activeElicitation ?: return
        sendElicitationResult(
            requestId = request.requestId,
            result = JsonObject(mapOf("action" to JsonPrimitive("decline"))),
            action = "decline",
        )
    }

    fun cancelElicitation() {
        val request = _uiState.value.activeElicitation ?: return
        sendElicitationResult(
            requestId = request.requestId,
            result = JsonObject(mapOf("action" to JsonPrimitive("cancel"))),
            action = "cancel",
        )
    }

    /** Called only after the browser accepted the URL. */
    fun acceptElicitationUrl() {
        val request = _uiState.value.activeElicitation as? Elicitation.Url ?: return
        sendElicitationResult(
            requestId = request.requestId,
            result = JsonObject(mapOf("action" to JsonPrimitive("accept"))),
            action = "accept",
        )
    }

    fun reportElicitationUrlOpenFailure(message: String) {
        _uiState.update { current ->
            current.copy(
                elicitationUiState = current.elicitationUiState.copy(urlOpenError = message),
            )
        }
    }

    fun clearElicitationUrlOpenFailure() {
        _uiState.update { current ->
            current.copy(
                elicitationUiState = current.elicitationUiState.copy(urlOpenError = null),
            )
        }
    }

    fun dismissUrlElicitation(requestId: String) {
        _uiState.update { current ->
            current.copy(
                urlElicitationsWaiting = current.urlElicitationsWaiting
                    .filterNot { item -> item.requestId == requestId },
            )
        }
    }

    private fun updateElicitationDraft(update: (ElicitationDraft) -> ElicitationDraft) {
        _uiState.update { current ->
            current.copy(
                elicitationUiState = current.elicitationUiState.copy(
                    draft = update(current.elicitationUiState.draft),
                    error = null,
                    urlOpenError = null,
                ),
            )
        }
    }

    private fun sendElicitationResult(
        requestId: String,
        result: JsonObject,
        action: String,
    ) {
        if (_uiState.value.elicitationUiState.submitting) {
            return
        }
        _uiState.update { current ->
            current.copy(
                elicitationUiState = current.elicitationUiState.copy(
                    submitting = true,
                    submittingAction = action,
                    error = null,
                    urlOpenError = null,
                ),
            )
        }
        viewModelScope.launch {
            sessionOwner.replyElicitation(requestId = requestId, result = result)
                .onFailure { error ->
                    val conflict = error is harold.android.network.AgentApiException &&
                        (error.error as? harold.android.network.AgentApiError.Problem)?.status == 409
                    _uiState.update { current ->
                        current.copy(
                            elicitationUiState = current.elicitationUiState.copy(
                                error = if (conflict) "Already resolved" else {
                                    error.message ?: "Reply failed"
                                },
                            ),
                        )
                    }
                }
            _uiState.update { current ->
                current.copy(
                    elicitationUiState = current.elicitationUiState.copy(
                        submitting = false,
                        submittingAction = null,
                    ),
                )
            }
        }
    }

    fun submitCancel() {
        val session = _uiState.value.selectedSession ?: return
        if (!_uiState.value.showComposerCancel) {
            return
        }

        _uiState.update { current ->
            current.copy(cancelSubmitting = true, cancelError = null)
        }
        viewModelScope.launch {
            sessionOwner.cancel()
                .onFailure { error ->
                    _uiState.update { current ->
                        current.copy(cancelError = error.message ?: "Cancel failed")
                    }
                }
            _uiState.update { current ->
                current.copy(cancelSubmitting = false)
            }
        }
    }

    fun onExtensionReplyChanged(text: String) {
        _uiState.update { current ->
            current.copy(
                extensionUiState = current.extensionUiState.copy(
                    replyText = text,
                    error = null,
                ),
            )
        }
    }

    fun submitExtensionReply() {
        val request = _uiState.value.extensionUiState.request ?: return
        val parsed = runCatching {
            harold.android.contracts.HaroldJson.parseToJsonElement(
                _uiState.value.extensionUiState.replyText,
            )
        }.getOrElse {
            _uiState.update { current ->
                current.copy(
                    extensionUiState = current.extensionUiState.copy(
                        error = "Result must be JSON.",
                    ),
                )
            }
            return
        }

        _uiState.update { current ->
            current.copy(extensionUiState = current.extensionUiState.copy(submitting = true))
        }
        viewModelScope.launch {
            sessionOwner.replyExtension(requestId = request.requestId, result = parsed)
                .onFailure { error ->
                    _uiState.update { current ->
                        current.copy(
                            extensionUiState = current.extensionUiState.copy(
                                error = error.message ?: "Reply failed",
                            ),
                        )
                    }
                }
            _uiState.update { current ->
                current.copy(extensionUiState = current.extensionUiState.copy(submitting = false))
            }
        }
    }

    fun skipExtension() {
        val request = _uiState.value.extensionUiState.request ?: return
        viewModelScope.launch {
            sessionOwner.replyExtension(
                requestId = request.requestId,
                result = JsonObject(emptyMap()),
            )
        }
    }

    fun selectSession(row: SessionRow) {
        viewModelScope.launch {
            activateSession(row)
            syncAttachmentGating()
        }
    }

    fun disconnectFromServer() {
        viewModelScope.launch {
            val selectedOrigin = _uiState.value.selectedSession?.connectionId?.takeIf { it.isNotEmpty() }
            val saved = connectionRepository.list()
            val targetSaved = if (selectedOrigin != null) {
                saved.find { connection -> connection.connectionId == selectedOrigin }
            } else {
                null
            }
            val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
            val originToRemove = targetSaved?.connectionId ?: active?.connectionId

            if (originToRemove != null) {
                val remains = forgetConnection(
                    connectionId = originToRemove,
                    repository = connectionRepository,
                )
                settleAfterForget(
                    removedConnectionId = originToRemove,
                    remains = remains,
                    gateway = connectionGateway,
                    disconnect = sessionOwner::disconnect,
                    connect = sessionOwner::connect,
                    showConnectionSetup = {
                        navigator.showShell()
                        navigator.openAddConnection()
                    },
                )
                clearPersistedSession()
                _uiState.update { current ->
                    current.copy(
                        selectedSession = if (current.selectedSession?.connectionId == originToRemove) {
                            null
                        } else {
                            current.selectedSession
                        },
                        availableCommands = emptyList(),
                        composerConfig = ComposerConfigUi(),
                    )
                }
                if (remains) {
                    refreshCatalog()
                } else {
                    activeSessionTracker?.replaceAll(emptyList())
                    sessionForegroundCoordinator?.onSessionsChanged()
                }
            } else {
                navigator.showShell()
                navigator.openAddConnection()
                clearPersistedSession()
                _uiState.update { current ->
                    current.copy(
                        availableCommands = emptyList(),
                        composerConfig = ComposerConfigUi(),
                    )
                }
                activeSessionTracker?.replaceAll(emptyList())
                sessionForegroundCoordinator?.onSessionsChanged()
            }
            if (_uiState.value.selectedSession == null) {
                clearChangesBadge()
            } else {
                refreshChangesBadge()
            }
        }
    }

    private fun holdUserInputForPrevious(next: SessionRow) {
        val current = _uiState.value.selectedSession ?: return
        if (current.id == next.id) {
            return
        }
        val request = _uiState.value.activePermissionRequest
        val elicitation = _uiState.value.activeElicitation
        val kind = userInputKind(
            hasPermission = request != null,
            hasQuestion = elicitation != null,
        ) ?: return
        sessionAttention?.mark(
            MarkedUserInput(
                rowId = current.id,
                sessionId = current.sessionId,
                sessionName = current.name,
                connectionIconId = current.connectionIconId,
                request = request,
                elicitation = elicitation,
            ),
        )
        permissionNotifier?.show(
            userInputNotification(
                sessionId = current.id,
                sessionName = current.name,
                connectionName = current.connectionName,
                connectionIconId = current.connectionIconId,
                kind = kind,
            ),
        )
        catalog = catalog.map { row ->
            if (row.id == current.id) {
                row.copy(needsAttention = true, attentionLabel = userInputLabel(kind))
            } else {
                row
            }
        }
    }

    private suspend fun activateSession(row: SessionRow) {
        openElicitationSheetOnArrival = false
        if (voiceDictationController.state.visible) {
            syncVoiceDictationState(voiceDictationController.cancel())
        }
        val applyPendingModel = pendingModelApply?.key == sessionModelKey(row)
        if (!applyPendingModel) {
            cancelModelApply()
        }
        navigationPreferences.saveLastSessionId(row.id)
        saveLastSelection(row)
        persistSelectedSession(row.id)
        clearComposer()
        holdUserInputForPrevious(row)
        val restored = sessionAttention?.marked?.value?.get(row.id)
        if (restored != null) {
            keepRestoredPermission = restored.request != null
            keepRestoredElicitation = restored.elicitation != null
            sessionAttention.clear(row.id)
            permissionNotifier?.clear(restored.rowId)
            catalog = catalog.map { item ->
                if (item.id == row.id) item.copy(needsAttention = false) else item
            }
        }
        val remembered = when {
            // The owner still holds this session's live stream and its
            // transcript; wiping here would blank the chat with no replay to
            // refill it, because watch() keeps the stream for the same
            // target.
            row.connectionReachable &&
                watchedOrigin == row.connectionId &&
                sessionOwner.watchTarget == WatchTarget(row.agentId, row.sessionId) ->
                _uiState.value.transcript

            !row.connectionReachable -> transcriptMemory[row.id] ?: emptyAcpTranscript
            else -> emptyAcpTranscript
        }
        _uiState.update { current ->
            current.resetSessionScopedState(
                SessionResetKeep(
                    selectedSession = row.copy(needsAttention = false),
                    transcript = remembered,
                    pendingPermissions = listOfNotNull(restored?.request),
                    pendingElicitations = listOfNotNull(restored?.elicitation),
                ),
            ).copy(
                sessions = catalog,
                modelSyncPending = applyPendingModel,
            )
        }
        agentAuth.resetFor(row.agentId)
        syncWatch()
        refreshChangesBadge()
        publishRecentSessions()
        syncActiveSessionsFromUiState()
        agentAuth.hydrate(row.agentId)
    }

    private fun applyLiveSnapshot(snapshot: SessionSnapshot) {
        val selected = _uiState.value.selectedSession
        val previousState = _uiState.value.effectiveSessionState
        if (
            selected != null &&
            !selected.connectionReachable &&
            snapshot.sessionId != selected.sessionId
        ) {
            return
        }
        val watchKey = catalogSessionKey(
            snapshot.agentId.orEmpty(),
            snapshot.sessionId.orEmpty(),
        )
        if (watchKey != lastLiveWatchKey) {
            lastLiveWatchKey = watchKey
            lastAuthRequired = false
        }

        agentAuth.absorbStream(snapshot.agentId, snapshot.agentAuth)

        configWriter.onSnapshot(
            connectionId = selectedSessionOrigin()
                ?: (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId,
            agentId = snapshot.agentId,
            sessionId = snapshot.sessionId,
            configOptions = snapshot.configOptions,
            live = snapshot.transcript.live,
        )
        if (snapshot.transcript.live) {
            applyRememberedModelIfPossible()
        }

        _uiState.update { current ->
            val extension = snapshot.extension
            val extensionUi = when {
                extension == null -> ExtensionUiState()
                current.extensionUiState.request?.requestId == extension.requestId ->
                    current.extensionUiState
                else -> ExtensionUiState(request = extension)
            }
            val permissionUi = if (snapshot.pendingPermission == null) {
                PermissionUiState()
            } else {
                current.permissionUiState
            }
            val permissions = if (snapshot.pendingPermission == null && keepRestoredPermission) {
                current.pendingPermissions
            } else {
                listOfNotNull(snapshot.pendingPermission)
            }
            if (snapshot.pendingPermission != null || snapshot.transcript.live) {
                keepRestoredPermission = false
            }

            val elicitations = if (
                snapshot.pendingElicitations.isEmpty() && keepRestoredElicitation
            ) {
                current.pendingElicitations
            } else {
                snapshot.pendingElicitations
            }
            if (snapshot.pendingElicitations.isNotEmpty() || snapshot.transcript.live) {
                keepRestoredElicitation = false
            }
            val activeElicitation = elicitations.firstOrNull()
            val elicitationUi = when {
                activeElicitation == null -> ElicitationUiState()
                current.elicitationUiState.requestId == activeElicitation.requestId ->
                    current.elicitationUiState
                else -> ElicitationUiState(
                    requestId = activeElicitation.requestId,
                    showSheet = current.elicitationUiState.showSheet,
                    draft = (activeElicitation as? Elicitation.Form)?.let { form ->
                        ElicitationDraft.fromQuestions(form.questions)
                    } ?: ElicitationDraft(),
                )
            }

            current.copy(
                transcript = snapshot.transcript,
                streamReconnecting = snapshot.reconnecting,
                availableCommands = snapshot.availableCommands,
                pendingPermissions = permissions,
                permissionUiState = permissionUi,
                pendingElicitations = elicitations,
                elicitationUiState = elicitationUi,
                urlElicitationsWaiting = snapshot.urlElicitationsAwaitingCompletion,
                completedElicitationIds = snapshot.completedElicitationIds,
                extensionUiState = extensionUi,
            )
        }
        if (openElicitationSheetOnArrival && _uiState.value.activeElicitation != null) {
            openElicitationSheetOnArrival = false
            openElicitationSheet()
        }

        applySnapshotWorktreePath(snapshot)
        syncSelectedState(snapshot.transcript.sessionState)
        val current = _uiState.value
        if (
            snapshot.sessionId != null &&
            snapshot.sessionId == current.selectedSession?.sessionId &&
            previousState == SessionState.Running &&
            current.effectiveSessionState == SessionState.Idle
        ) {
            refreshChangesBadge()
        }
        val open = current.selectedSession
        if (open != null && snapshot.sessionId == open.sessionId) {
            transcriptMemory[open.id] = current.transcript
        }

        if (snapshot.authRequired && !lastAuthRequired) {
            val agentId = snapshot.agentId
            if (agentId != null) {
                viewModelScope.launch {
                    agentAuth.hydrate(agentId)
                }
            }
        }
        lastAuthRequired = snapshot.authRequired
    }

    /**
     * A worktree path event is a targeted update. The transcript snapshot is
     * rebuilt for every frame, so only a frame that actually carried a path
     * may touch the cached row.
     */
    private fun applySnapshotWorktreePath(snapshot: SessionSnapshot) {
        // A null path only means "clear" when a worktree event delivered it.
        // Every initial/reset snapshot also carries null, and clearing then
        // would wipe the cached path before the agent touches a worktree.
        if (snapshot.worktreePath == null && !snapshot.worktreePathKnown) {
            return
        }
        val open = _uiState.value.selectedSession ?: return
        if (
            snapshot.agentId != open.agentId ||
            snapshot.sessionId != open.sessionId ||
            snapshot.worktreePath == open.worktreePath
        ) {
            return
        }
        val origin = open.connectionId.ifEmpty { activeOrigin.orEmpty() }
        if (origin.isEmpty() || open.sessionId.isEmpty()) {
            return
        }

        val updated = open.copy(worktreePath = snapshot.worktreePath)
        catalog = catalog.map { row -> if (row.id == updated.id) updated else row }
        _uiState.update { current ->
            current.copy(
                selectedSession = updated,
                sessions = catalog,
            )
        }
        viewModelScope.launch {
            sessionRepository.updateWorktreePath(
                connectionId = origin,
                agentId = open.agentId,
                sessionId = open.sessionId,
                worktreePath = snapshot.worktreePath,
            )
        }
        refreshChangesBadge()
    }

    private fun applySessionTitles(titles: Map<String, String>) {
        if (titles.isEmpty()) {
            return
        }
        val renamed = catalog.map { row -> titleFor(row, titles)?.let { title -> row.copy(name = title) } ?: row }
        catalog = renamed
        _uiState.update { current ->
            current.copy(
                sessions = renamed,
                selectedSession = current.selectedSession?.let { row ->
                    titleFor(row, titles)?.let { title -> row.copy(name = title) } ?: row
                },
            )
        }
        publishRecentSessions()
        syncActiveSessionsFromUiState()
    }

    /**
     * `session/list` is the only title source for agents that never push
     * `session_info_update`. Pull it once per session when a turn completes
     * and the header still shows a placeholder.
     */
    private suspend fun pullSelectedSessionTitle() {
        val selected = _uiState.value.selectedSession ?: return
        val placeholderName = selected.name.isBlank() ||
            selected.name == selected.sessionId ||
            selected.name == NEW_SESSION_NAME
        if (selected.sessionId.isEmpty() || !placeholderName) {
            return
        }
        val origin = selected.connectionId.ifEmpty {
            (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId.orEmpty()
        }
        if (origin.isEmpty()) {
            return
        }
        if (!titlePulledSessionIds.add(selected.id)) {
            return
        }

        userRepository.listSessions(origin).onSuccess { collection ->
            val listed = collection.items.firstOrNull { session ->
                catalogSessionKey(session.agentId, session.sessionId) == selected.id
            } ?: return@onSuccess
            if (listed.title.isBlank() || listed.title == listed.sessionId) {
                return@onSuccess
            }
            if (sessionOwner.sessionTitles.value.containsKey(selected.id)) {
                return@onSuccess
            }
            applySessionTitles(mapOf(selected.id to listed.title))
        }
    }

    private suspend fun openSessionFromNotification(sessionId: String) {
        val selected = _uiState.value.selectedSession
        if (selected?.sessionId == sessionId || selected?.id == sessionId) {
            return
        }
        val row = catalog.firstOrNull { session -> session.id == sessionId }
            ?: catalog.firstOrNull { session -> session.sessionId == sessionId }
            ?: return
        // A question tapped from a notification opens its sheet; permissions
        // already render inline and never auto-open anything. The snapshot may
        // arrive after the tap, so the flag survives until it does.
        activateSession(row)
        if (_uiState.value.activeElicitation != null) {
            openElicitationSheet()
        } else {
            openElicitationSheetOnArrival = true
        }
    }

    private fun titleFor(row: SessionRow, titles: Map<String, String>): String? {
        titles[row.id]?.let { title -> return title }
        val key = catalogSessionKey(row.agentId, row.sessionId)
        if (row.connectionId.isNotEmpty() && watchedOrigin != null && row.connectionId != watchedOrigin) {
            return null
        }
        return titles[key]
    }

    /**
     * A selected session must always be the watched session. Reachability only
     * gates the composer, it does not clear the target: the owner can resume
     * the stream and deliver a prompt after a transient link loss.
     */
    private fun syncWatch() {
        val selected = _uiState.value.selectedSession
        if (selected == null) {
            sessionOwner.watch(null, null)
            return
        }
        if (selected.connectionId.isNotEmpty()) {
            watchedOrigin = selected.connectionId
            sessionOwner.connect(selected.connectionId)
        }
        sessionOwner.watch(selected.agentId, selected.sessionId)
        refreshLiveCapabilities()
    }

    private fun onHaroldLinks(links: List<ConnectionHealth>) {
        val byOrigin = links.associateBy { link -> link.connectionId }
        fun reachableFor(row: SessionRow): Boolean {
            val link = byOrigin[row.connectionId] ?: return row.connectionReachable
            return when (link.status) {
                ConnectionStatus.Connected -> true
                ConnectionStatus.Unreachable -> false
                // Closed means the link was parked, for example while the
                // photo picker had the app in the background. It is not a
                // reachability failure. Keep the last state until the link
                // reconnects, so a selected session stays watched.
                ConnectionStatus.Closed,
                ConnectionStatus.Connecting,
                -> row.connectionReachable
            }
        }
        catalog = catalog.map { row ->
            val reachable = reachableFor(row)
            if (reachable == row.connectionReachable) row else row.copy(connectionReachable = reachable)
        }
        val selected = _uiState.value.selectedSession
        val updatedSelected = selected?.copy(connectionReachable = reachableFor(selected))
        _uiState.update { current ->
            current.copy(sessions = catalog, selectedSession = updatedSelected ?: current.selectedSession)
        }
        publishRecentSessions()
        syncWatch()
    }

    private suspend fun refreshCatalog() = refreshMutex.withLock {
        loadConnectionMetadata()
        publishLiveSessions()

        val origins = targetOrigins()
        _uiState.update { current ->
            current.copy(
                isRefreshing = origins.isNotEmpty(),
                sessionsError = null,
                activeConnectionName = activeHarold()?.name.orEmpty(),
                activeConnectionColorId = activeHarold()?.colorId.orEmpty(),
                activeConnectionIconId = activeHarold()?.iconId.orEmpty(),
            )
        }
        if (origins.isEmpty()) {
            _uiState.update { current -> current.copy(isRefreshing = false, hasLoaded = true) }
            return@withLock
        }

        var anySuccess = false
        var lastError: Throwable? = null
        origins.forEach { connectionId ->
            val refreshResult = sessionRepository.refresh(connectionId)
            refreshResult.fold(
                onSuccess = { catalog ->
                    applyWorkspaces(catalog.workspaces)
                    applyAgents(catalog.agents)
                    anySuccess = true
                    unreachableOrigins.remove(connectionId)
                },
                onFailure = { error ->
                    lastError = error
                    unreachableOrigins.add(connectionId)
                },
            )
        }

        publishLiveSessions()
        _uiState.update { current ->
            current.copy(
                hasLoaded = true,
                isRefreshing = false,
                sessionsError = if (!anySuccess && catalog.isEmpty()) {
                    lastError?.let(::apiErrorMessage) ?: "Could not reach Harold"
                } else {
                    null
                },
            )
        }
        publishRecentSessions()
        syncActiveSessionsFromUiState()
        syncWatch()
        maybeRestoreLastSession()
    }

    private suspend fun loadConnectionMetadata() {
        savedConnections = connectionRepository.list()
        activeOrigin = (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId
        metadataLoaded = true
        unreachableOrigins.retainAll(targetOrigins().toSet())
    }

    private fun targetOrigins(): List<String> =
        if (savedConnections.isNotEmpty()) {
            savedConnections.map { connection -> connection.connectionId }.distinct()
        } else {
            listOfNotNull(activeOrigin)
        }

    private fun activeHarold(): SavedConnection? =
        savedConnections.firstOrNull { connection -> connection.connectionId == activeOrigin }
            ?: savedConnections.firstOrNull()

    private fun applyWorkspaces(workspaces: List<Workspace>?) {
        val rows = workspaces.orEmpty().map { workspace -> workspace.toWorkspaceRow() }
        if (rows.isNotEmpty()) {
            workspaceByPath = workspaceByPath + rows.associateBy { row -> row.path }
        }
    }

    private fun applyAgents(agents: List<AgentSettings>?) {
        if (agents.isNullOrEmpty()) {
            return
        }
        agentLabels = agentLabels + agents.associate { agent -> agent.id to agent.displayName }
        agentAuth.mergeSummaries(agents.associate { agent -> agent.id to agent.authSummary })
    }

    /**
     * Paints the live ACP session catalog. Each agent's rows arrive as its
     * `session/list` answer lands, so a slow agent does not hide the rest.
     */
    private fun publishLiveSessions() {
        if (!metadataLoaded) {
            return
        }
        val origins = targetOrigins()
        val scopedToHarold = savedConnections.isNotEmpty()
        val haroldByOrigin = savedConnections.associateBy { connection -> connection.connectionId }
        val pushedTitles = sessionOwner.sessionTitles.value
        val rows = liveSessions
            .filter { listed -> listed.connectionId in origins }
            .map { listed ->
                val connection = haroldByOrigin[listed.connectionId]
                val row = listed.toSessionRow().copy(
                    connectionId = if (scopedToHarold) listed.connectionId else "",
                    connectionName = connection?.name.orEmpty(),
                    connectionColorId = connection?.colorId.orEmpty(),
                    connectionIconId = connection?.iconId.orEmpty(),
                    connectionReachable = listed.connectionId !in unreachableOrigins,
                )
                titleFor(row, pushedTitles)?.let { title -> row.copy(name = title) } ?: row
            }
            .sortedByDescending { row -> row.updatedAt }
        catalog = rows
        val selected = _uiState.value.selectedSession
        val updatedSelected = selected?.let { current ->
            rows.firstOrNull { row -> row.id == current.id }?.copy(
                state = current.state,
                needsAttention = current.needsAttention,
            ) ?: current
        }
        _uiState.update { current ->
            current.copy(
                sessions = rows,
                hasLoaded = true,
                selectedSession = updatedSelected ?: current.selectedSession,
                sessionsError = if (rows.isNotEmpty()) null else current.sessionsError,
            )
        }
        publishRecentSessions()
        syncActiveSessionsFromUiState()
        syncWatch()
        maybeRestoreLastSession()
    }

    private fun maybeRestoreLastSession() {
        if (_uiState.value.selectedSession != null || catalog.isEmpty()) {
            return
        }
        if (restoreJob?.isActive == true) {
            return
        }
        restoreJob = viewModelScope.launch {
            restoreLastSession()
        }
    }

    private fun publishRecentSessions() {
        val recent = catalog
            .sortedByDescending { row -> row.updatedAt }
            .take(RECENT_SESSIONS_LIMIT)
        _uiState.update { current -> current.copy(recentSessions = recent) }
    }

    private suspend fun restoreLastSession() {
        if (_uiState.value.isPendingNewSession) {
            return
        }

        val savedId = savedStateHandle.get<String>(KEY_SELECTED_SESSION_ID)
            ?: navigationPreferences.loadLastSessionId()
            ?: return

        val row = catalog.firstOrNull { session -> session.id == savedId }
            ?: catalog.firstOrNull { session -> session.sessionId == savedId }
            ?: return
        if (_uiState.value.selectedSession?.id == row.id) {
            _uiState.update { current -> current.copy(selectedSession = row) }
            if (row.connectionReachable) {
                if (row.connectionId.isNotEmpty()) {
                    watchedOrigin = row.connectionId
                    sessionOwner.connect(row.connectionId)
                }
                sessionOwner.watch(row.agentId, row.sessionId)
            }
            refreshChangesBadge()
            return
        }
        activateSession(row)
    }

    private suspend fun selectSessionLocally(sessionKey: String) {
        val row = catalog.firstOrNull { session -> session.id == sessionKey }
            ?: return
        _uiState.update { current -> current.copy(selectedSession = row) }
        syncAttachmentGating()
        refreshChangesBadge()
    }

    private fun persistSelectedSession(sessionKey: String) {
        savedStateHandle[KEY_SELECTED_SESSION_ID] = sessionKey
    }

    private suspend fun clearPersistedSession() {
        savedStateHandle.remove<String>(KEY_SELECTED_SESSION_ID)
        navigationPreferences.clearLastSessionId()
    }

    private fun dropSession(row: SessionRow) {
        sessionOwner.forget(row.agentId, row.sessionId)
        catalog = catalog.filterNot { item -> item.id == row.id }
        val selectedWasDeleted = _uiState.value.selectedSession?.id == row.id
        if (selectedWasDeleted) {
            sessionOwner.watch(null, null)
            clearComposer()
            viewModelScope.launch { clearPersistedSession() }
            agentAuth.resetFor(null)
        }
        _uiState.update { current ->
            val reset = if (selectedWasDeleted) current.resetSessionScopedState() else current
            reset.copy(sessions = catalog, pickerVisible = false)
        }
        if (selectedWasDeleted) {
            clearChangesBadge()
        }
        publishRecentSessions()
        syncActiveSessionsFromUiState()
    }

    private fun syncSelectedState(state: SessionState?) {
        if (state == null) {
            return
        }
        _uiState.update { current ->
            val selected = current.selectedSession ?: return@update current
            val next = selected.copy(state = state)
            catalog = catalog.map { row -> if (row.id == next.id) next else row }
            current.copy(
                selectedSession = next,
                sessions = catalog,
            )
        }
        publishRecentSessions()
        syncActiveSessionsFromUiState()
    }

    private fun syncActiveSessionsFromUiState() {
        val snapshots = catalog.map { row ->
            ActiveSessionSnapshot(
                id = row.id,
                name = row.name,
                state = row.state,
                connectionIconId = row.connectionIconId.ifEmpty { null },
            )
        }
        activeSessionTracker?.let { tracker ->
            tracker.replaceAll(snapshots)
            sessionForegroundCoordinator?.onSessionsChanged()
        }
        val fallback = (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId
        catalog.groupBy { row -> row.connectionId.ifEmpty { fallback.orEmpty() } }
            .forEach { (origin, rows) ->
                if (origin.isNotEmpty()) {
                    connections?.setSessionStates(origin, rows.map { row -> row.state })
                }
            }
    }

    private suspend fun saveLastSelection(row: SessionRow) {
        if (row.workspaceId.isEmpty() || row.agentId.isEmpty()) {
            return
        }
        val origin = row.connectionId.ifEmpty {
            (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId.orEmpty()
        }
        if (origin.isEmpty()) {
            return
        }
        sessionPreferences.saveLastSessionSelection(
            LastSessionSelection(
                connectionId = origin,
                workspaceId = row.workspaceId,
                agentId = row.agentId,
            ),
        )
    }

    /**
     * A created session applies its remembered model once the config option arrives.
     * The pending key means "block submit until this settles, or until the timeout".
     */
    private fun markModelApplyPending(row: SessionRow) {
        val key = sessionModelKey(row)
        if (key.isEmpty()) {
            return
        }
        val pending = PendingModelApply(
            connectionId = row.connectionId.ifEmpty {
                (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId.orEmpty()
            },
            agentId = row.agentId,
            sessionId = row.sessionId,
        )
        pendingModelApply = pending
        pendingModelValue = null
        pendingModelValueLoaded = false
        appliedModelSessions.remove(key)
    }

    private fun startModelSync() {
        val pending = pendingModelApply ?: return
        modelSyncTimeoutJob?.cancel()
        modelSyncTimeoutJob = viewModelScope.launch {
            // The registry only has a session after session/load completes,
            // and the stream cannot deliver Subscribed before that. Waiting
            // for live closes the window where a config write hits an empty
            // registry and shows "Open this session again".
            val live = withTimeoutOrNull(MODEL_SYNC_LIVE_TIMEOUT_MS) {
                sessionOwner.snapshot.first { snapshot ->
                    snapshot.transcript.live &&
                        snapshot.agentId == pending.agentId &&
                        snapshot.sessionId == pending.sessionId
                }
            }
            if (pendingModelApply != pending) {
                return@launch
            }
            if (live == null) {
                finishModelSync(pending.key)
                return@launch
            }
            val remembered = sessionPreferences.loadLastModel(
                connectionId = pending.connectionId,
                agentId = pending.agentId,
            )
            if (pendingModelApply != pending) {
                return@launch
            }
            pendingModelValue = remembered
            pendingModelValueLoaded = true
            if (remembered == null) {
                finishModelSync(pending.key)
                return@launch
            }
            applyRememberedModelIfPossible()
            delay(MODEL_SYNC_TIMEOUT_MS)
            finishModelSync(pending.key)
        }
    }

    private fun applyRememberedModelIfPossible() {
        val pending = pendingModelApply ?: return
        val liveSnapshot = sessionOwner.snapshot.value
        if (!liveSnapshot.transcript.live ||
            liveSnapshot.agentId != pending.agentId ||
            liveSnapshot.sessionId != pending.sessionId
        ) {
            return
        }
        val selected = _uiState.value.selectedSession ?: return
        if (sessionModelKey(selected) != pending.key) {
            return
        }
        if (!pendingModelValueLoaded) {
            return
        }
        val remembered = pendingModelValue ?: run {
            finishModelSync(pending.key)
            return
        }
        // Cached and fresh config frames both arrive; write once per session.
        if (pending.key in appliedModelSessions) {
            return
        }
        val option = configWriter.state.value.model as? SelectOption ?: return
        if (option.options.none { value -> value.value == remembered }) {
            finishModelSync(pending.key)
            return
        }
        appliedModelSessions.add(pending.key)
        if (option.currentValue == remembered) {
            finishModelSync(pending.key)
            return
        }
        configWriter.set(option.id, ConfigValue.Text(remembered))
    }

    private fun finishModelSync(key: String) {
        if (pendingModelApply?.key != key) {
            return
        }
        pendingModelApply = null
        pendingModelValue = null
        pendingModelValueLoaded = false
        modelSyncTimeoutJob?.cancel()
        modelSyncTimeoutJob = null
        _uiState.update { current ->
            if (current.modelSyncPending) current.copy(modelSyncPending = false) else current
        }
    }

    private fun cancelModelApply() {
        pendingModelApply = null
        pendingModelValue = null
        pendingModelValueLoaded = false
        modelSyncTimeoutJob?.cancel()
        modelSyncTimeoutJob = null
    }

    private fun sessionModelKey(row: SessionRow): String {
        val origin = row.connectionId.ifEmpty {
            (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId.orEmpty()
        }
        if (origin.isEmpty() || row.sessionId.isEmpty()) {
            return ""
        }
        return modelSyncKey(origin, row.agentId, row.sessionId)
    }

    private fun pendingSessionRow(workspace: WorkspaceRow, agentId: AgentId): SessionRow =
        SessionRow(
            sessionId = "",
            name = NEW_SESSION_NAME,
            cwd = workspace.path,
            workspaceId = workspace.id,
            workspaceLabel = workspace.name,
            agentId = agentId,
            agentLabel = agentLabels[agentId] ?: agentId,
            state = SessionState.Idle,
            updatedAt = "",
            connectionId = workspace.connectionId,
            connectionName = workspace.connectionName,
            connectionColorId = workspace.connectionColorId,
            connectionIconId = workspace.connectionIconId,
        )

    /**
     * The create response carries the agent's config options; seed them so the
     * composer's model, mode, and effort selectors render before the first
     * prompt instead of waiting on the stream.
     */
    private fun rememberCreatedConfig(created: CreateSessionResponse) {
        sessionOwner.rememberConfig(
            agentId = created.agentId,
            sessionId = created.sessionId,
            configOptions = parseConfigOptions(created.configOptions),
        )
    }

    override fun onCleared() {
        voiceDictationController.destroy()
        sessionOwner.watch(null, null)
        super.onCleared()
    }

    companion object {
        const val KEY_SELECTED_SESSION_ID = "selected_session_id"
        const val RECENT_SESSIONS_LIMIT = 5
        const val NEW_SESSION_NAME = "New session"
        const val MODEL_SYNC_TIMEOUT_MS = 3_000L
        const val MODEL_SYNC_LIVE_TIMEOUT_MS = 30_000L

        fun modelSyncKey(connectionId: String, agentId: AgentId, sessionId: String): String =
            "$connectionId|$agentId|$sessionId"
    }

    private data class PendingModelApply(
        val connectionId: String,
        val agentId: AgentId,
        val sessionId: String,
    ) {
        val key: String
            get() = modelSyncKey(connectionId, agentId, sessionId)
    }
}
