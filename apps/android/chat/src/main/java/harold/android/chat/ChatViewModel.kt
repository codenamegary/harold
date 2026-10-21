package harold.android.chat

import androidx.annotation.VisibleForTesting
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.chat.composer.ComposerConfigUi
import harold.android.chat.composer.SessionConfigWriter
import harold.android.chat.composer.completeSlashCommand
import harold.android.chat.composer.supportsFileAttachments
import harold.android.chat.composer.supportsImageAttachments
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.SessionState
import harold.android.contracts.catalogSessionKey
import harold.android.contracts.parseConfigOptions
import harold.android.contracts.toSummary
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.forgetSavedHarold
import harold.android.credentials.settleAfterForget
import harold.android.di.PreviewDispatcher
import harold.android.foreground.ActiveSessionSnapshot
import harold.android.foreground.ActiveSessionTracker
import harold.android.foreground.OpenSessionRequests
import harold.android.foreground.SessionForegroundCoordinator
import harold.android.live.AcpTranscriptState
import harold.android.live.SessionOwner
import harold.android.live.SessionSnapshot
import harold.android.live.emptyAcpTranscript
import harold.android.navigation.NavigationPreferences
import harold.android.navigation.Navigator
import harold.android.network.AttachmentApi
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val userRepository: UserRepository,
    private val savedHaroldRepository: SavedHaroldRepository,
    private val attachmentApi: AttachmentApi,
    private val configApi: SessionConfigApi,
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
) : ViewModel() {
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val configWriter = SessionConfigWriter(configApi, viewModelScope)

    /**
     * The composer's text and caret. The prompt input paints its tokens from
     * these, so they are the source of truth; [ChatUiState.composerText]
     * mirrors the text for everything that reads state instead of the field.
     */
    val composerState = TextFieldState()

    private var workspaceByPath: Map<String, WorkspaceRow> = emptyMap()
    private var agentLabels: Map<AgentId, String> = emptyMap()
    private var agentAuthSummaries: Map<AgentId, AgentAuthSummary> = emptyMap()
    private var agentCapabilities: Map<AgentId, AgentCapabilityInventory?> = emptyMap()
    private val retainedByOrigin = mutableMapOf<String, List<SessionRow>>()
    private val transcriptMemory = mutableMapOf<String, AcpTranscriptState>()
    private var watchedOrigin: String? = null
    private var attachmentLocalIdCounter: Int = 0
    private var catalog: List<SessionRow> = emptyList()
    private val titlePulledSessionIds = mutableSetOf<String>()
    private var authHydrateGeneration: Int = 0
    private var lastLiveWatchKey: String? = null
    private var lastAuthRequired: Boolean = false
    private var pendingCreateInFlight = false

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
            sessionGateway.pairedState.collect { paired ->
                if (paired is PairedState.Paired) {
                    sessionForegroundCoordinator?.setServerOrigin(paired.serverOrigin)
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
                    is SessionCommand.Created -> openCreatedSession(command.response)
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
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        sessionForegroundCoordinator?.setServerOrigin(paired.serverOrigin)
        viewModelScope.launch {
            refreshCatalog()
        }
    }

    fun onBackground() {
        sessionOwner.onBackground()
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

    private suspend fun openCreatedSession(created: CreateSessionResponse) {
        rememberCreatedConfig(created)
        activateSession(created.toSession().toSessionRow(workspaceByPath, agentLabels))
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
            current.copy(
                selectedSession = pendingSessionRow(workspace = workspace, agentId = agentId),
                pickerVisible = false,
                transcript = emptyAcpTranscript,
                composerText = "",
                composerError = null,
                composerSubmitting = false,
                availableCommands = emptyList(),
                composerConfig = ComposerConfigUi(),
                voiceCommandPrefix = "",
                voiceCommandListVisible = false,
                pendingPermissions = emptyList(),
                permissionUiState = PermissionUiState(),
                extensionUiState = ExtensionUiState(),
                streamReconnecting = false,
                agentAuth = null,
                agentAuthSummary = agentAuthSummaries[agentId],
                authPanelSubmitting = false,
                authActionBusy = false,
                authError = null,
            )
        }
        sessionOwner.watch(agentId, null)
        syncActiveSessionsFromUiState()
        hydrateAgentAuth(agentId)
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
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        pendingCreateInFlight = true
        viewModelScope.launch {
            userRepository.createSession(
                serverOrigin = paired.serverOrigin,
                body = CreateSessionBody(agentId = agentId, cwd = pending.cwd),
            ).fold(
                onSuccess = { created ->
                    if (_uiState.value.selectedSession == pending) {
                        openCreatedSession(created)
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
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
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
            viewModelScope.launch { uploadAttachment(paired.serverOrigin, attachment) }
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
                val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return@launch
                val session = _uiState.value.selectedSession ?: return@launch
                attachmentApi.deleteAttachment(
                    serverOrigin = paired.serverOrigin,
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
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
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
        viewModelScope.launch { uploadAttachment(paired.serverOrigin, attachment) }
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
        startAuthSession(session.agentId)
    }

    fun onAuthConfirm(stepId: String) {
        val selected = _uiState.value.selectedSession ?: return
        val authSession = _uiState.value.agentAuth?.session ?: return
        if (_uiState.value.authActionBusy || _uiState.value.authPanelSubmitting) {
            return
        }
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { current ->
            current.copy(authActionBusy = true, authError = null)
        }
        viewModelScope.launch {
            userRepository.applyAgentAuthSessionAction(
                serverOrigin = paired.serverOrigin,
                agentId = selected.agentId,
                sessionId = authSession.sessionId,
                action = AuthSessionAction.Confirm(stepId = stepId),
            ).fold(
                onSuccess = { updatedSession ->
                    applyAuthSessionResult(selected.agentId, updatedSession)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            authActionBusy = false,
                            authError = apiErrorMessage(error),
                        )
                    }
                },
            )
        }
    }

    fun onAuthCancel() {
        val selected = _uiState.value.selectedSession ?: return
        val authSession = _uiState.value.agentAuth?.session ?: return
        if (_uiState.value.authActionBusy || _uiState.value.authPanelSubmitting) {
            return
        }
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { current ->
            current.copy(authActionBusy = true, authError = null)
        }
        viewModelScope.launch {
            userRepository.applyAgentAuthSessionAction(
                serverOrigin = paired.serverOrigin,
                agentId = selected.agentId,
                sessionId = authSession.sessionId,
                action = AuthSessionAction.Cancel,
            ).fold(
                onSuccess = { updatedSession ->
                    applyAuthSessionResult(selected.agentId, updatedSession)
                    hydrateAgentAuth(selected.agentId)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            authActionBusy = false,
                            authError = apiErrorMessage(error),
                        )
                    }
                },
            )
        }
    }

    fun onAuthLogout() {
        val selected = _uiState.value.selectedSession ?: return
        val summary = _uiState.value.authSummary
        if (summary?.canLogout != true) {
            return
        }
        if (_uiState.value.authActionBusy ||
            _uiState.value.authPanelSubmitting ||
            _uiState.value.agentAuth?.session?.status == AuthSessionStatus.InProgress
        ) {
            return
        }
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { current ->
            current.copy(authActionBusy = true, authError = null)
        }
        viewModelScope.launch {
            userRepository.logoutAgentAuth(
                serverOrigin = paired.serverOrigin,
                agentId = selected.agentId,
            ).fold(
                onSuccess = { logoutSummary ->
                    agentAuthSummaries = agentAuthSummaries + (selected.agentId to logoutSummary)
                    _uiState.update { current ->
                        current.copy(
                            agentAuth = AgentAuth(
                                agentId = selected.agentId,
                                status = logoutSummary.status,
                                error = logoutSummary.error,
                                session = null,
                            ),
                            agentAuthSummary = logoutSummary,
                            authActionBusy = false,
                            authError = null,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            authActionBusy = false,
                            authError = apiErrorMessage(error),
                        )
                    }
                },
            )
        }
    }

    fun disconnectFromServer() {
        viewModelScope.launch {
            val paired = sessionGateway.pairedState.value as? PairedState.Paired
            if (paired != null) {
                val remains = forgetSavedHarold(
                    serverOrigin = paired.serverOrigin,
                    deviceId = paired.deviceId,
                    revoke = userRepository::revokeDevice,
                    repository = savedHaroldRepository,
                )
                settleAfterForget(
                    removedOrigin = paired.serverOrigin,
                    remains = remains,
                    gateway = sessionGateway,
                    disconnect = sessionOwner::disconnect,
                    connect = sessionOwner::connect,
                    showPairing = {
                        navigator.showShell()
                        navigator.openPairing()
                    },
                )
            } else {
                navigator.showShell()
                navigator.openPairing()
            }
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
    }

    private fun startAuthSession(agentId: AgentId) {
        if (_uiState.value.authPanelSubmitting || _uiState.value.authActionBusy) {
            return
        }
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { current ->
            current.copy(authPanelSubmitting = true, authError = null)
        }
        viewModelScope.launch {
            userRepository.startAgentAuthSession(
                serverOrigin = paired.serverOrigin,
                agentId = agentId,
            ).fold(
                onSuccess = { session ->
                    applyAuthSessionResult(agentId, session)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            authPanelSubmitting = false,
                            authError = apiErrorMessage(error),
                        )
                    }
                },
            )
        }
    }

    private fun applyAuthSessionResult(
        agentId: AgentId,
        session: harold.android.contracts.AgentAuthSession,
    ) {
        val canLogout = agentAuthSummaries[agentId]?.canLogout ?: false
        val auth = AgentAuth(
            agentId = agentId,
            status = when (session.status) {
                AuthSessionStatus.Succeeded -> AgentAuthStatus.Authenticated
                AuthSessionStatus.Failed -> AgentAuthStatus.Error
                AuthSessionStatus.Cancelled,
                AuthSessionStatus.InProgress,
                -> AgentAuthStatus.NeedsAuth
            },
            error = session.error,
            session = session,
        )
        val summary = auth.toSummary(canLogout = canLogout)
        agentAuthSummaries = agentAuthSummaries + (agentId to summary)
        _uiState.update { current ->
            if (current.selectedSession?.agentId != agentId) {
                return@update current
            }
            current.copy(
                agentAuth = auth,
                agentAuthSummary = summary,
                authPanelSubmitting = false,
                authActionBusy = false,
                authError = null,
            )
        }
        createPendingSessionAfterLogin(agentId, auth.status)
    }

    private suspend fun hydrateAgentAuth(
        agentId: AgentId,
        attachHostLoginIfNeeded: Boolean = false,
    ) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        val generation = ++authHydrateGeneration
        userRepository.getAgentAuth(
            serverOrigin = paired.serverOrigin,
            agentId = agentId,
        ).fold(
            onSuccess = { auth ->
                if (generation != authHydrateGeneration) {
                    return
                }
                if (_uiState.value.selectedSession?.agentId != agentId) {
                    return
                }
                val canLogout = agentAuthSummaries[agentId]?.canLogout ?: false
                val summary = auth.toSummary(canLogout = canLogout)
                agentAuthSummaries = agentAuthSummaries + (agentId to summary)
                val sessionInFlight = auth.session?.status == AuthSessionStatus.InProgress
                _uiState.update { current ->
                    current.copy(
                        agentAuth = auth,
                        agentAuthSummary = summary,
                        authError = null,
                    )
                }
                if (
                    attachHostLoginIfNeeded &&
                    !sessionInFlight &&
                    auth.status == AgentAuthStatus.NeedsAuth
                ) {
                    startAuthSession(agentId)
                }
                createPendingSessionAfterLogin(agentId, auth.status)
            },
            onFailure = { error ->
                if (generation != authHydrateGeneration) {
                    return
                }
                if (_uiState.value.selectedSession?.agentId != agentId) {
                    return
                }
                _uiState.update { current ->
                    current.copy(authError = apiErrorMessage(error))
                }
            },
        )
    }

    private suspend fun activateSession(row: SessionRow) {
        if (voiceDictationController.state.visible) {
            syncVoiceDictationState(voiceDictationController.cancel())
        }
        navigationPreferences.saveLastSessionId(row.id)
        persistSelectedSession(row.id)
        clearComposer()
        val summaryFromCatalog = agentAuthSummaries[row.agentId]
        val remembered = if (row.haroldReachable) {
            emptyAcpTranscript
        } else {
            transcriptMemory[row.id] ?: emptyAcpTranscript
        }
        _uiState.update { current ->
            current.copy(
                selectedSession = row,
                pickerVisible = false,
                transcript = remembered,
                composerText = "",
                composerError = null,
                availableCommands = emptyList(),
                composerConfig = ComposerConfigUi(),
                voiceCommandPrefix = "",
                voiceCommandListVisible = false,
                pendingPermissions = emptyList(),
                permissionUiState = PermissionUiState(),
                extensionUiState = ExtensionUiState(),
                streamReconnecting = false,
                agentAuth = null,
                agentAuthSummary = summaryFromCatalog,
                authPanelSubmitting = false,
                authActionBusy = false,
                authError = null,
            )
        }
        if (row.serverOrigin.isNotEmpty()) {
            watchedOrigin = row.serverOrigin
            sessionOwner.connect(row.serverOrigin)
        }
        if (row.haroldReachable) {
            sessionOwner.watch(row.agentId, row.sessionId)
        } else {
            sessionOwner.watch(null, null)
        }
        syncActiveSessionsFromUiState()
        hydrateAgentAuth(row.agentId)
    }

    private fun applyLiveSnapshot(snapshot: SessionSnapshot) {
        val selected = _uiState.value.selectedSession
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

        val streamAuth = snapshot.agentAuth
        val streamAuthSummary = if (streamAuth != null) {
            val agentId = snapshot.agentId
            val canLogout = agentId?.let { id -> agentAuthSummaries[id]?.canLogout } ?: false
            val summary = streamAuth.toSummary(canLogout = canLogout)
            if (agentId != null) {
                agentAuthSummaries = agentAuthSummaries + (agentId to summary)
            }
            summary
        } else {
            null
        }

        configWriter.onSnapshot(
            serverOrigin = (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin,
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
            current.copy(
                transcript = snapshot.transcript,
                streamReconnecting = snapshot.reconnecting,
                availableCommands = snapshot.availableCommands,
                pendingPermissions = listOfNotNull(snapshot.pendingPermission),
                permissionUiState = permissionUi,
                extensionUiState = extensionUi,
                agentAuth = streamAuth ?: current.agentAuth,
                agentAuthSummary = streamAuthSummary ?: current.agentAuthSummary,
            )
        }
        syncSelectedState(snapshot.transcript.sessionState)
        val open = _uiState.value.selectedSession
        if (open != null && snapshot.sessionId == open.sessionId) {
            transcriptMemory[open.id] = _uiState.value.transcript
        }

        if (snapshot.authRequired && !lastAuthRequired) {
            val agentId = snapshot.agentId
            if (agentId != null) {
                viewModelScope.launch {
                    hydrateAgentAuth(agentId, attachHostLoginIfNeeded = true)
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
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        if (!titlePulledSessionIds.add(selected.id)) {
            return
        }

        userRepository.listSessions(paired.serverOrigin).onSuccess { collection ->
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
        if (_uiState.value.selectedSession?.sessionId == sessionId) {
            return
        }
        val row = catalog.firstOrNull { session -> session.sessionId == sessionId } ?: return
        activateSession(row)
    }

    private fun titleFor(row: SessionRow, titles: Map<String, String>): String? {
        titles[row.id]?.let { title -> return title }
        val key = catalogSessionKey(row.agentId, row.sessionId)
        if (row.serverOrigin.isNotEmpty() && watchedOrigin != null && row.serverOrigin != watchedOrigin) {
            return null
        }
        return titles[key]
    }

    private fun onHaroldLinks(links: List<HaroldConnection>) {
        val byOrigin = links.associateBy { link -> link.serverOrigin }
        fun reachableFor(row: SessionRow): Boolean {
            val link = byOrigin[row.serverOrigin] ?: return row.haroldReachable
            return when (link.status) {
                HaroldConnectionStatus.Connected -> true
                HaroldConnectionStatus.Unreachable,
                HaroldConnectionStatus.Closed,
                -> false
                HaroldConnectionStatus.Connecting -> row.haroldReachable
            }
        }
        catalog = catalog.map { row ->
            val reachable = reachableFor(row)
            if (reachable == row.haroldReachable) row else row.copy(haroldReachable = reachable)
        }
        val selected = _uiState.value.selectedSession
        val updatedSelected = selected?.copy(haroldReachable = reachableFor(selected))
        val becameReachable = selected != null &&
            !selected.haroldReachable &&
            updatedSelected?.haroldReachable == true
        val becameUnreachable = selected != null &&
            selected.haroldReachable &&
            updatedSelected?.haroldReachable == false
        _uiState.update { current ->
            current.copy(sessions = catalog, selectedSession = updatedSelected ?: current.selectedSession)
        }
        publishRecentSessions()
        if (becameUnreachable) {
            sessionOwner.watch(null, null)
        }
        if (becameReachable) {
            val next = updatedSelected ?: return
            if (next.serverOrigin.isNotEmpty()) {
                watchedOrigin = next.serverOrigin
                sessionOwner.connect(next.serverOrigin)
            }
            sessionOwner.watch(next.agentId, next.sessionId)
        }
    }

    private suspend fun refreshCatalog() {
        val saved = savedHaroldRepository.list()
        if (saved.isEmpty()) {
            refreshPairedCatalog()
        } else {
            refreshSavedCatalog(saved)
        }
    }

    private suspend fun refreshPairedCatalog() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        _uiState.update { current ->
            current.copy(sessionsLoading = true, sessionsError = null)
        }

        val workspacesResult = userRepository.listWorkspaces(paired.serverOrigin)
        val sessionsResult = userRepository.listSessions(paired.serverOrigin)
        val agentsResult = userRepository.listAgents(paired.serverOrigin)

        val workspaces = workspacesResult.getOrNull()?.items.orEmpty().map { workspace ->
            workspace.toWorkspaceRow()
        }
        workspaceByPath = workspaces.associateBy { workspace -> workspace.path }
        agentLabels = agentsResult.getOrNull()?.items.orEmpty()
            .associate { agent -> agent.id to agent.displayName }
        agentAuthSummaries = agentsResult.getOrNull()?.items.orEmpty()
            .associate { agent -> agent.id to agent.authSummary }
        agentCapabilities = agentsResult.getOrNull()?.items.orEmpty()
            .associate { agent -> agent.id to agent.capabilities }
        syncAttachmentGating()

        sessionsResult.fold(
            onSuccess = { collection ->
                val pushedTitles = sessionOwner.sessionTitles.value
                catalog = collection.items
                    .map { session -> session.toSessionRow(workspaceByPath, agentLabels) }
                    .map { row -> pushedTitles[row.id]?.let { title -> row.copy(name = title) } ?: row }
                _uiState.update { current ->
                    current.copy(
                        sessions = catalog,
                        sessionsLoading = false,
                        sessionsError = null,
                    )
                }
                publishRecentSessions()
                syncActiveSessionsFromUiState()
                restoreLastSession()
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(
                        sessionsLoading = false,
                        sessionsError = apiErrorMessage(error),
                    )
                }
            },
        )
    }

    private suspend fun refreshSavedCatalog(saved: List<StoredCredential>) {
        _uiState.update { current ->
            current.copy(sessionsLoading = true, sessionsError = null)
        }
        var anySuccess = catalog.isNotEmpty()
        saved.forEach { harold ->
            val workspaces = userRepository.listWorkspaces(harold.serverOrigin)
                .getOrNull()
                ?.items
                .orEmpty()
                .map { workspace -> workspace.toWorkspaceRow() }
            val workspaceByPathForHarold = workspaces.associateBy { workspace -> workspace.path }
            if (workspaceByPathForHarold.isNotEmpty()) {
                workspaceByPath = workspaceByPath + workspaceByPathForHarold
            }
            val agents = userRepository.listAgents(harold.serverOrigin).getOrNull()?.items.orEmpty()
            if (agents.isNotEmpty()) {
                agentLabels = agentLabels + agents.associate { agent -> agent.id to agent.displayName }
                agentAuthSummaries = agentAuthSummaries + agents.associate { agent -> agent.id to agent.authSummary }
                agentCapabilities = agentCapabilities + agents.associate { agent -> agent.id to agent.capabilities }
            }
            val sessionsResult = userRepository.listSessions(harold.serverOrigin)
            if (sessionsResult.isSuccess) {
                anySuccess = true
                val labels = agentLabels
                retainedByOrigin[harold.serverOrigin] = sessionsResult.getOrThrow().items.map { session ->
                    session.toSessionRow(workspaceByPathForHarold, labels).copy(
                        serverOrigin = harold.serverOrigin,
                        haroldName = harold.name,
                        haroldColorId = harold.colorId,
                        haroldIconId = harold.iconId,
                        haroldReachable = true,
                    )
                }
            } else {
                retainedByOrigin[harold.serverOrigin] = retainedByOrigin[harold.serverOrigin]
                    .orEmpty()
                    .map { row -> row.copy(haroldReachable = false) }
            }
        }
        syncAttachmentGating()
        retainedByOrigin.keys.retainAll(saved.map { harold -> harold.serverOrigin }.toSet())
        val pushedTitles = sessionOwner.sessionTitles.value
        catalog = retainedByOrigin.values.flatten()
            .map { row -> titleFor(row, pushedTitles)?.let { title -> row.copy(name = title) } ?: row }
            .sortedByDescending { row -> row.updatedAt }
        if (anySuccess || catalog.isNotEmpty()) {
            _uiState.update { current ->
                current.copy(
                    sessions = catalog,
                    sessionsLoading = false,
                    sessionsError = null,
                )
            }
            publishRecentSessions()
            syncActiveSessionsFromUiState()
            restoreLastSession()
        } else {
            _uiState.update { current ->
                current.copy(
                    sessionsLoading = false,
                    sessionsError = "Could not reach Harold",
                )
            }
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
            if (row.haroldReachable) {
                if (row.serverOrigin.isNotEmpty()) {
                    watchedOrigin = row.serverOrigin
                    sessionOwner.connect(row.serverOrigin)
                }
                sessionOwner.watch(row.agentId, row.sessionId)
            }
            return
        }
        activateSession(row)
    }

    private suspend fun selectSessionLocally(sessionKey: String) {
        val row = catalog.firstOrNull { session -> session.id == sessionKey }
            ?: return
        _uiState.update { current -> current.copy(selectedSession = row) }
        syncAttachmentGating()
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
        }
        _uiState.update { current ->
            current.copy(
                sessions = catalog,
                selectedSession = if (selectedWasDeleted) null else current.selectedSession,
                transcript = if (selectedWasDeleted) emptyAcpTranscript else current.transcript,
                composerText = if (selectedWasDeleted) "" else current.composerText,
                availableCommands = if (selectedWasDeleted) emptyList() else current.availableCommands,
                composerConfig = if (selectedWasDeleted) ComposerConfigUi() else current.composerConfig,
                voiceCommandPrefix = if (selectedWasDeleted) "" else current.voiceCommandPrefix,
                voiceCommandListVisible = if (selectedWasDeleted) false else current.voiceCommandListVisible,
                pendingPermissions = if (selectedWasDeleted) emptyList() else current.pendingPermissions,
                permissionUiState = if (selectedWasDeleted) PermissionUiState() else current.permissionUiState,
                extensionUiState = if (selectedWasDeleted) ExtensionUiState() else current.extensionUiState,
                agentAuth = if (selectedWasDeleted) null else current.agentAuth,
                agentAuthSummary = if (selectedWasDeleted) null else current.agentAuthSummary,
                authPanelSubmitting = if (selectedWasDeleted) false else current.authPanelSubmitting,
                authActionBusy = if (selectedWasDeleted) false else current.authActionBusy,
                authError = if (selectedWasDeleted) null else current.authError,
                pickerVisible = false,
            )
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
            ActiveSessionSnapshot(id = row.sessionId, name = row.name, state = row.state)
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
