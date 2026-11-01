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
import harold.android.contracts.AgentAuthStatus
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
import harold.android.contracts.SessionState
import harold.android.contracts.Workspace
import harold.android.contracts.catalogSessionKey
import harold.android.contracts.parseConfigOptions
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.forgetSavedHarold
import harold.android.credentials.settleAfterForget
import harold.android.database.session.CachedSession
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
import harold.android.live.SessionSnapshot
import harold.android.live.emptyAcpTranscript
import harold.android.live.toContent
import harold.android.navigation.NavigationPreferences
import harold.android.navigation.Navigator
import harold.android.network.AttachmentApi
import harold.android.network.GitApi
import harold.android.network.SessionConfigApi
import harold.android.network.apiErrorMessage
import harold.android.credentials.StoredCredential
import harold.android.session.HaroldConnection
import harold.android.session.HaroldConnectionStatus
import harold.android.session.HaroldConnections
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.stream.ConnectionStatus
import harold.android.ui.promptinput.PromptEdit
import harold.android.ui.promptinput.applyEdit
import harold.android.user.UserRepository
import harold.android.voice.VoiceDictationController
import harold.android.voice.VoiceDictationUiState
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val savedHaroldRepository: SavedHaroldRepository,
    private val attachmentApi: AttachmentApi,
    private val configApi: SessionConfigApi,
    private val gitApi: GitApi,
    private val navigationPreferences: NavigationPreferences,
    private val activeSessionTracker: ActiveSessionTracker? = null,
    private val sessionForegroundCoordinator: SessionForegroundCoordinator? = null,
    private val openSessionRequests: OpenSessionRequests? = null,
    @get:VisibleForTesting
    val voiceDictationController: VoiceDictationController,
    @PreviewDispatcher private val previewDispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val navigator: Navigator,
    private val sessionCommands: SessionCommands,
    private val haroldConnections: HaroldConnections? = null,
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
        origin = ::selectedOrPairedOrigin,
        selectedAgent = { _uiState.value.selectedSession?.agentId },
        onAuthenticated = ::createPendingSessionAfterLogin,
    )

    /**
     * Session-scoped actions must follow the selected session's Harold. The
     * paired state is only the active fallback for legacy single-Harold flows.
     */
    private fun selectedSessionOrigin(): String? =
        _uiState.value.selectedSession?.serverOrigin?.takeIf { origin -> origin.isNotEmpty() }

    private fun selectedOrPairedOrigin(): String? =
        selectedSessionOrigin()
            ?: (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin

    /**
     * The composer's text and caret. The prompt input paints its tokens from
     * these, so they are the source of truth; [ChatUiState.composerText]
     * mirrors the text for everything that reads state instead of the field.
     */
    val composerState = TextFieldState()

    private var workspaceByPath: Map<String, WorkspaceRow> = emptyMap()
    private var agentLabels: Map<AgentId, String> = emptyMap()
    private var agentCapabilities: Map<AgentId, AgentCapabilityInventory?> = emptyMap()
    private var cachedSessions: List<CachedSession> = emptyList()
    private var savedHarolds: List<StoredCredential> = emptyList()
    private var pairedOrigin: String? = null
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
    private var pendingCreateInFlight = false
    private var changesBadgeJob: Job? = null
    private var changesBadgeKey: String? = null

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
                cachedSessions = sessions
                if (metadataLoaded) {
                    publishCachedSessions()
                }
            }
        }

        viewModelScope.launch {
            sessionOwner.connectionState.collect { state ->
                val banner = when (val status = state.status) {
                    ConnectionStatus.Idle -> null
                    ConnectionStatus.Connecting -> "Connecting…"
                    ConnectionStatus.Live -> null
                    is ConnectionStatus.Reconnecting -> "Reconnecting (attempt ${status.attempt})"
                    is ConnectionStatus.AuthFailed -> "Auth failed"
                    is ConnectionStatus.TransportError -> status.message
                }
                _uiState.update { current -> current.copy(connectionBanner = banner) }
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
            agentAuth.state.collect { auth ->
                _uiState.update { current -> current.copy(agentAuth = auth) }
            }
        }

        viewModelScope.launch {
            sessionGateway.pairedState.collect { paired ->
                if (paired is PairedState.Paired) {
                    sessionForegroundCoordinator?.setServerOrigin(
                        selectedSessionOrigin() ?: paired.serverOrigin,
                    )
                    _uiState.value.selectedSession?.let { selected ->
                        sessionOwner.watch(selected.agentId, selected.sessionId)
                    }
                    refreshCatalog()
                } else {
                    sessionForegroundCoordinator?.setServerOrigin(null)
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

        haroldConnections?.let { connections ->
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
        val origin = selectedOrPairedOrigin() ?: return
        sessionForegroundCoordinator?.setServerOrigin(origin)
        viewModelScope.launch {
            refreshCatalog()
        }
    }

    fun onBackground() {
        sessionOwner.onBackground()
    }

    private fun refreshChangesBadge() {
        val selected = _uiState.value.selectedSession
        val origin = selectedOrPairedOrigin()
        val cwd = selected?.cwd.orEmpty()
        if (
            selected == null ||
            origin == null ||
            selected.sessionId.isEmpty() ||
            cwd.isEmpty()
        ) {
            clearChangesBadge()
            return
        }

        val key = "${selected.id}|$origin|$cwd"
        if (changesBadgeKey == key && changesBadgeJob?.isActive == true) {
            return
        }
        changesBadgeKey = key
        changesBadgeJob?.cancel()
        changesBadgeJob = viewModelScope.launch {
            val result = gitApi.getSummary(serverOrigin = origin, path = cwd)
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
            serverOrigin = created.serverOrigin,
            haroldName = created.haroldName,
            haroldColorId = created.haroldColorId,
            haroldIconId = created.haroldIconId,
        )
        activateSession(row)
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

    private fun createPendingSessionAfterLogin(agentId: AgentId, status: AgentAuthStatus) {
        val pending = _uiState.value.selectedSession ?: return
        if (
            status != AgentAuthStatus.Authenticated ||
            pending.sessionId.isNotEmpty() ||
            pending.agentId != agentId ||
            pendingCreateInFlight
        ) {
            return
        }
        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        val origin = pending.serverOrigin.ifEmpty { paired?.serverOrigin } ?: return

        pendingCreateInFlight = true
        viewModelScope.launch {
            sessionRepository.createSession(
                serverOrigin = origin,
                body = CreateSessionBody(agentId = agentId, cwd = pending.cwd),
            ).fold(
                onSuccess = { created ->
                    if (_uiState.value.selectedSession == pending) {
                        openCreatedSession(
                            SessionCommand.Created(
                                response = created,
                                serverOrigin = origin,
                                haroldName = pending.haroldName,
                                haroldColorId = pending.haroldColorId,
                                haroldIconId = pending.haroldIconId,
                            ),
                        )
                    } else {
                        refreshCatalog()
                    }
                },
                onFailure = { error ->
                    _uiState.update { current -> current.copy(composerError = apiErrorMessage(error)) }
                },
            )
            pendingCreateInFlight = false
        }
    }

    fun submitComposerPrompt() {
        val session = _uiState.value.selectedSession ?: return
        val prompt = composerState.text.toString().trim()

        if (prompt.isEmpty() || !_uiState.value.composerEnabled) {
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
        val origin = selectedOrPairedOrigin() ?: return
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
                val origin = selectedOrPairedOrigin() ?: return@launch
                val session = _uiState.value.selectedSession ?: return@launch
                attachmentApi.deleteAttachment(
                    serverOrigin = origin,
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
        val origin = selectedOrPairedOrigin() ?: return
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

    private suspend fun uploadAttachment(serverOrigin: String, attachment: PendingAttachmentUi) {
        val session = _uiState.value.selectedSession?.takeIf { it.sessionId.isNotEmpty() }
        if (session == null) {
            failAttachment(attachment.localId, "No session selected")
            return
        }
        val result = attachmentApi.uploadAttachment(
            serverOrigin = serverOrigin,
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
        val inventory = session?.agentId?.let { agentId -> agentCapabilities[agentId] }
        _uiState.update { current ->
            current.copy(
                supportsImageAttachments = supportsImageAttachments(inventory),
                supportsFileAttachments = supportsFileAttachments(inventory),
            )
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

    fun onAuthSignIn() {
        val session = _uiState.value.selectedSession ?: return
        agentAuth.signIn(session.agentId)
    }

    fun onAuthConfirm(stepId: String) {
        val selected = _uiState.value.selectedSession ?: return
        agentAuth.confirm(selected.agentId, stepId)
    }

    fun onAuthCancel() {
        val selected = _uiState.value.selectedSession ?: return
        agentAuth.cancel(selected.agentId)
    }

    fun onAuthLogout() {
        val selected = _uiState.value.selectedSession ?: return
        agentAuth.logout(selected.agentId)
    }

    fun disconnectFromServer() {
        viewModelScope.launch {
            val selectedOrigin = _uiState.value.selectedSession?.serverOrigin?.takeIf { it.isNotEmpty() }
            val saved = savedHaroldRepository.list()
            val targetSaved = if (selectedOrigin != null) {
                saved.find { harold -> harold.serverOrigin == selectedOrigin }
            } else {
                null
            }
            val paired = sessionGateway.pairedState.value as? PairedState.Paired
            val originToRemove = targetSaved?.serverOrigin ?: paired?.serverOrigin
            val deviceIdToRemove = targetSaved?.deviceId ?: paired?.deviceId

            if (originToRemove != null && deviceIdToRemove != null) {
                val remains = forgetSavedHarold(
                    serverOrigin = originToRemove,
                    deviceId = deviceIdToRemove,
                    revoke = userRepository::revokeDevice,
                    repository = savedHaroldRepository,
                )
                settleAfterForget(
                    removedOrigin = originToRemove,
                    remains = remains,
                    gateway = sessionGateway,
                    disconnect = sessionOwner::disconnect,
                    connect = sessionOwner::connect,
                    showPairing = {
                        navigator.showShell()
                        navigator.openPairing()
                    },
                )
                clearPersistedSession()
                _uiState.update { current ->
                    current.copy(
                        selectedSession = if (current.selectedSession?.serverOrigin == originToRemove) {
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
                navigator.openPairing()
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
                haroldIconId = current.haroldIconId,
                request = request,
                elicitation = elicitation,
            ),
        )
        permissionNotifier?.show(
            userInputNotification(
                sessionId = current.id,
                sessionName = current.name,
                haroldName = current.haroldName,
                haroldIconId = current.haroldIconId,
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
        navigationPreferences.saveLastSessionId(row.id)
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
        val remembered = if (row.haroldReachable) {
            emptyAcpTranscript
        } else {
            transcriptMemory[row.id] ?: emptyAcpTranscript
        }
        _uiState.update { current ->
            current.resetSessionScopedState(
                SessionResetKeep(
                    selectedSession = row.copy(needsAttention = false),
                    transcript = remembered,
                    pendingPermissions = listOfNotNull(restored?.request),
                    pendingElicitations = listOfNotNull(restored?.elicitation),
                ),
            ).copy(sessions = catalog)
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
            !selected.haroldReachable &&
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
            serverOrigin = selectedSessionOrigin()
                ?: (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin,
            agentId = snapshot.agentId,
            sessionId = snapshot.sessionId,
            configOptions = snapshot.configOptions,
        )

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
                    agentAuth.hydrate(agentId, autoStartLogin = true)
                }
            }
        }
        lastAuthRequired = snapshot.authRequired
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
     * Session/list is the only title source for agents that never push
     * session_info_update. Pull it once per session when a turn completes and
     * the header still shows the raw ACP session id.
     */
    private suspend fun pullSelectedSessionTitle() {
        val selected = _uiState.value.selectedSession ?: return
        if (selected.sessionId.isEmpty() || selected.name != selected.sessionId) {
            return
        }
        val origin = selected.serverOrigin.ifEmpty {
            (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin.orEmpty()
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
        if (row.serverOrigin.isNotEmpty() && watchedOrigin != null && row.serverOrigin != watchedOrigin) {
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
        if (selected.serverOrigin.isNotEmpty()) {
            watchedOrigin = selected.serverOrigin
            sessionOwner.connect(selected.serverOrigin)
        }
        sessionOwner.watch(selected.agentId, selected.sessionId)
    }

    private fun onHaroldLinks(links: List<HaroldConnection>) {
        val byOrigin = links.associateBy { link -> link.serverOrigin }
        fun reachableFor(row: SessionRow): Boolean {
            val link = byOrigin[row.serverOrigin] ?: return row.haroldReachable
            return when (link.status) {
                HaroldConnectionStatus.Connected -> true
                HaroldConnectionStatus.Unreachable -> false
                // Closed means the link was parked, for example while the
                // photo picker had the app in the background. It is not a
                // reachability failure. Keep the last state until the link
                // reconnects, so a selected session stays watched.
                HaroldConnectionStatus.Closed,
                HaroldConnectionStatus.Connecting,
                -> row.haroldReachable
            }
        }
        catalog = catalog.map { row ->
            val reachable = reachableFor(row)
            if (reachable == row.haroldReachable) row else row.copy(haroldReachable = reachable)
        }
        val selected = _uiState.value.selectedSession
        val updatedSelected = selected?.copy(haroldReachable = reachableFor(selected))
        _uiState.update { current ->
            current.copy(sessions = catalog, selectedSession = updatedSelected ?: current.selectedSession)
        }
        publishRecentSessions()
        syncWatch()
    }

    private suspend fun refreshCatalog() = refreshMutex.withLock {
        loadHaroldMetadata()
        publishCachedSessions()

        val origins = targetOrigins()
        _uiState.update { current ->
            current.copy(
                isRefreshing = origins.isNotEmpty(),
                sessionsError = null,
                activeHaroldName = activeHarold()?.name.orEmpty(),
                activeHaroldColorId = activeHarold()?.colorId.orEmpty(),
                activeHaroldIconId = activeHarold()?.iconId.orEmpty(),
            )
        }
        if (origins.isEmpty()) {
            _uiState.update { current -> current.copy(isRefreshing = false, hasLoaded = true) }
            return@withLock
        }

        var anySuccess = false
        var lastError: Throwable? = null
        origins.forEach { serverOrigin ->
            val refreshResult = sessionRepository.refresh(serverOrigin)
            refreshResult.fold(
                onSuccess = { catalog ->
                    applyWorkspaces(catalog.workspaces)
                    applyAgents(catalog.agents)
                    anySuccess = true
                    unreachableOrigins.remove(serverOrigin)
                },
                onFailure = { error ->
                    lastError = error
                    unreachableOrigins.add(serverOrigin)
                },
            )
        }

        publishCachedSessions()
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

    private suspend fun loadHaroldMetadata() {
        savedHarolds = savedHaroldRepository.list()
        pairedOrigin = (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin
        metadataLoaded = true
        unreachableOrigins.retainAll(targetOrigins().toSet())
    }

    private fun targetOrigins(): List<String> =
        if (savedHarolds.isNotEmpty()) {
            savedHarolds.map { harold -> harold.serverOrigin }.distinct()
        } else {
            listOfNotNull(pairedOrigin)
        }

    private fun activeHarold(): StoredCredential? =
        savedHarolds.firstOrNull { harold -> harold.serverOrigin == pairedOrigin }
            ?: savedHarolds.firstOrNull()

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
        agentCapabilities = agentCapabilities + agents.associate { agent -> agent.id to agent.capabilities }
        syncAttachmentGating()
    }

    /**
     * Paints the Room snapshot before the network refresh starts. The refresh
     * writes to Room, and the flow collector calls this again with fresh rows.
     */
    private fun publishCachedSessions() {
        if (!metadataLoaded) {
            return
        }
        val origins = targetOrigins()
        val scopedToHarold = savedHarolds.isNotEmpty()
        val haroldByOrigin = savedHarolds.associateBy { harold -> harold.serverOrigin }
        val pushedTitles = sessionOwner.sessionTitles.value
        val rows = cachedSessions
            .filter { cached -> cached.serverOrigin in origins }
            .map { cached ->
                val harold = haroldByOrigin[cached.serverOrigin]
                val row = cached.toSessionRow().copy(
                    serverOrigin = if (scopedToHarold) cached.serverOrigin else "",
                    haroldName = harold?.name.orEmpty(),
                    haroldColorId = harold?.colorId.orEmpty(),
                    haroldIconId = harold?.iconId.orEmpty(),
                    haroldReachable = cached.serverOrigin !in unreachableOrigins,
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
            if (row.haroldReachable) {
                if (row.serverOrigin.isNotEmpty()) {
                    watchedOrigin = row.serverOrigin
                    sessionOwner.connect(row.serverOrigin)
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
                haroldIconId = row.haroldIconId.ifEmpty { null },
            )
        }
        activeSessionTracker?.let { tracker ->
            tracker.replaceAll(snapshots)
            sessionForegroundCoordinator?.onSessionsChanged()
        }
        val fallback = (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin
        catalog.groupBy { row -> row.serverOrigin.ifEmpty { fallback.orEmpty() } }
            .forEach { (origin, rows) ->
                if (origin.isNotEmpty()) {
                    haroldConnections?.setSessionStates(origin, rows.map { row -> row.state })
                }
            }
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
            serverOrigin = workspace.serverOrigin,
            haroldName = workspace.haroldName,
            haroldColorId = workspace.haroldColorId,
            haroldIconId = workspace.haroldIconId,
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
    }
}
