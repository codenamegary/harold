package harold.android.chat

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.AttachmentReference
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.joinAll
import kotlinx.serialization.json.JsonObject
import harold.android.chat.composer.ComposerConfigUi
import harold.android.chat.composer.SessionConfigWriter
import harold.android.chat.composer.completeSlashCommand
import harold.android.chat.composer.supportsFileAttachments
import harold.android.chat.composer.supportsImageAttachments
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AuthSessionAction
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.parseConfigOptions
import harold.android.contracts.Session
import harold.android.contracts.SessionState
import harold.android.contracts.WorkspaceState
import harold.android.contracts.catalogSessionKey
import harold.android.contracts.toSummary
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.AttachmentApi
import harold.android.network.SessionConfigApi
import harold.android.live.SessionOwner
import harold.android.live.SessionSnapshot
import harold.android.stream.ConnectionStatus
import harold.android.foreground.ActiveSessionSnapshot
import harold.android.foreground.ActiveSessionTracker
import harold.android.foreground.OpenSessionRequests
import harold.android.foreground.SessionForegroundCoordinator
import harold.android.navigation.NavigationPreferences
import harold.android.operator.OperatorRepository
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.ui.promptinput.PromptEdit
import harold.android.ui.promptinput.applyEdit

class ChatViewModel(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val operatorRepository: OperatorRepository,
    private val attachmentApi: AttachmentApi,
    private val configApi: SessionConfigApi,
    private val navigationPreferences: NavigationPreferences,
    private val activeSessionTracker: ActiveSessionTracker? = null,
    private val sessionForegroundCoordinator: SessionForegroundCoordinator? = null,
    private val openSessionRequests: OpenSessionRequests? = null,
    private val voiceDictationController: VoiceDictationController,
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
    private var attachmentLocalIdCounter: Int = 0
    private var catalog: List<SessionRow> = emptyList()
    private var authHydrateGeneration: Int = 0
    private var lastLiveWatchKey: String? = null
    private var lastAuthRequired: Boolean = false
    private val draftSessionLock = Mutex()

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
    }

    fun onResume() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        sessionForegroundCoordinator?.setServerOrigin(paired.serverOrigin)
        viewModelScope.launch {
            refreshCatalog()
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
            publishDerivedSessionLists()
            _uiState.update { current ->
                current.copy(recentSessionsLoading = false)
            }
        }
    }

    fun hidePicker() {
        _uiState.update { current -> current.copy(pickerVisible = false) }
    }

    fun openSessionsList() {
        hidePicker()
        _uiState.update { current ->
            current.copy(
                sessionsListSearch = "",
                sessionsListError = null,
                sessionsListLoading = true,
            )
        }
        viewModelScope.launch {
            refreshCatalog()
            publishDerivedSessionLists()
            _uiState.update { current -> current.copy(sessionsListLoading = false) }
        }
    }

    fun onSessionsSearchChanged(query: String) {
        _uiState.update { current ->
            current.copy(sessionsListSearch = query)
        }
        publishDerivedSessionLists()
    }

    fun selectSessionFromList(row: SessionRow) {
        selectSession(row)
    }

    fun showCreateDialog() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { current -> current.copy(createDialogVisible = true) }

        viewModelScope.launch {
            val createState = loadCreateForm(paired.serverOrigin)
            _uiState.update { current ->
                current.copy(createState = createState)
            }
        }
    }

    fun hideCreateDialog() {
        _uiState.update { current ->
            current.copy(
                createDialogVisible = false,
                createState = CreateSessionUiState(),
            )
        }
    }

    fun onCreateWorkspaceChanged(workspaceId: String) {
        _uiState.update { current ->
            current.copy(
                createState = current.createState.copy(
                    selectedWorkspaceId = workspaceId,
                    error = null,
                ),
            )
        }
    }

    fun onCreateAgentChanged(agentId: AgentId) {
        _uiState.update { current ->
            current.copy(
                createState = current.createState.copy(
                    selectedAgentId = agentId,
                    error = null,
                ),
            )
        }
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

    fun confirmNewSession() {
        val createState = _uiState.value.createState
        val workspaceId = createState.selectedWorkspaceId
        val agentId = createState.selectedAgentId
        val workspace = createState.workspaces.firstOrNull { row -> row.id == workspaceId }

        if (workspaceId.isEmpty() || workspace == null) {
            _uiState.update { current ->
                current.copy(createState = current.createState.copy(error = "Choose a workspace"))
            }
            return
        }

        if (agentId == null) {
            _uiState.update { current ->
                current.copy(createState = current.createState.copy(error = "Choose an agent"))
            }
            return
        }

        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        if (paired == null) {
            _uiState.update { current ->
                current.copy(createState = current.createState.copy(error = "Connect to Harold first"))
            }
            return
        }

        _uiState.update { current ->
            current.copy(createState = current.createState.copy(submitting = true, error = null))
        }

        // The session is created here, not on the first prompt, so the create
        // response can seed the composer's model, mode, and effort selectors
        // before the user writes anything. The web client works the same way.
        viewModelScope.launch {
            val result = operatorRepository.createSession(
                serverOrigin = paired.serverOrigin,
                body = CreateSessionBody(
                    agentId = agentId,
                    cwd = workspace.path,
                ),
            )

            result.fold(
                onSuccess = { created ->
                    rememberCreatedConfig(created)
                    val row = created.toSession().toSessionRow()
                    hideCreateDialog()
                    clearComposer()
                    adoptCreatedSession(row)
                    syncActiveSessionsFromUiState()
                    hydrateAgentAuth(row.agentId)
                    refreshCatalog()
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            createState = current.createState.copy(
                                submitting = false,
                                error = errorMessage(error),
                            ),
                        )
                    }
                },
            )
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

        if (session.sessionId.isEmpty()) {
            createSessionFromComposer(session = session, prompt = prompt, attachments = references)
            return
        }

        clearComposer()
        _uiState.update { current ->
            current.copy(
                composerText = "",
                composerSubmitting = false,
                composerError = null,
                pendingAttachments = emptyList(),
            )
        }
        sessionOwner.prompt(prompt, references)
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
                val preview = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) {
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
        val session = sessionForAttachment(serverOrigin).getOrElse { error ->
            failAttachment(attachment.localId, errorMessage(error))
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
            onFailure = { error -> failAttachment(attachment.localId, errorMessage(error)) },
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

    /**
     * Attachments belong to a session and the server decides where they live. A draft has no
     * session yet, so create it now. The lock makes several files picked together share one.
     */
    private suspend fun sessionForAttachment(serverOrigin: String): Result<SessionRow> =
        draftSessionLock.withLock {
            val session = _uiState.value.selectedSession
                ?: return@withLock Result.failure(IllegalStateException("No session selected"))
            if (session.sessionId.isNotEmpty()) {
                return@withLock Result.success(session)
            }
            operatorRepository.createSession(
                serverOrigin = serverOrigin,
                body = CreateSessionBody(agentId = session.agentId, cwd = session.cwd),
            ).map { created ->
                rememberCreatedConfig(created)
                created.toSession().toSessionRow().also { row -> adoptCreatedSession(row) }
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
        sessionOwner.replyPermission(requestId = active.id, optionId = optionId)
    }

    fun submitCancel() {
        val session = _uiState.value.selectedSession ?: return
        if (!_uiState.value.showComposerCancel) {
            return
        }

        _uiState.update { current ->
            current.copy(cancelSubmitting = true, cancelError = null)
        }
        sessionOwner.cancel()
        _uiState.update { current ->
            current.copy(cancelSubmitting = false)
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
        sessionOwner.replyExtension(requestId = request.requestId, result = parsed)
    }

    fun skipExtension() {
        val request = _uiState.value.extensionUiState.request ?: return
        sessionOwner.replyExtension(
            requestId = request.requestId,
            result = JsonObject(emptyMap()),
        )
    }

    fun deleteSession(row: SessionRow) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        viewModelScope.launch {
            operatorRepository.deleteSession(
                serverOrigin = paired.serverOrigin,
                agentId = row.agentId,
                sessionId = row.sessionId,
            ).fold(
                onSuccess = {
                    dropSession(row)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(sessionsError = errorMessage(error))
                    }
                },
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
            operatorRepository.applyAgentAuthSessionAction(
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
                            authError = errorMessage(error),
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
            operatorRepository.applyAgentAuthSessionAction(
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
                            authError = errorMessage(error),
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
            operatorRepository.logoutAgentAuth(
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
                            authError = errorMessage(error),
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
                operatorRepository.revokeDevice(
                    serverOrigin = paired.serverOrigin,
                    deviceId = paired.deviceId,
                )
            }
            sessionOwner.disconnect()
            clearPersistedSession()
            _uiState.update { current ->
                current.copy(
                    availableCommands = emptyList(),
                    composerConfig = ComposerConfigUi(),
                )
            }
            activeSessionTracker?.replaceAll(emptyList())
            sessionForegroundCoordinator?.onSessionsChanged()
            sessionForegroundCoordinator?.setServerOrigin(null)
            sessionGateway.clearLocalAccess()
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
            operatorRepository.startAgentAuthSession(
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
                            authError = errorMessage(error),
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
    }

    private suspend fun hydrateAgentAuth(
        agentId: AgentId,
        attachHostLoginIfNeeded: Boolean = false,
    ) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        val generation = ++authHydrateGeneration
        operatorRepository.getAgentAuth(
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
            },
            onFailure = { error ->
                if (generation != authHydrateGeneration) {
                    return
                }
                if (_uiState.value.selectedSession?.agentId != agentId) {
                    return
                }
                _uiState.update { current ->
                    current.copy(authError = errorMessage(error))
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
        _uiState.update { current ->
            current.copy(
                selectedSession = row,
                pickerVisible = false,
                transcript = emptyAcpTranscript,
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
        sessionOwner.watch(row.agentId, row.sessionId)
        syncActiveSessionsFromUiState()
        hydrateAgentAuth(row.agentId)
    }

    private fun applyLiveSnapshot(snapshot: SessionSnapshot) {
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
            val extensionUi = when {
                snapshot.extension == null -> ExtensionUiState()
                current.extensionUiState.request?.requestId == snapshot.extension.requestId ->
                    current.extensionUiState
                else -> ExtensionUiState(request = snapshot.extension)
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

    private suspend fun openSessionFromNotification(sessionId: String) {
        if (_uiState.value.selectedSession?.sessionId == sessionId) {
            return
        }
        val row = catalog.firstOrNull { session -> session.sessionId == sessionId } ?: return
        activateSession(row)
    }

    private suspend fun refreshCatalog() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        _uiState.update { current ->
            current.copy(sessionsLoading = true, sessionsError = null)
        }

        val workspacesResult = operatorRepository.listWorkspaces(paired.serverOrigin)
        val sessionsResult = operatorRepository.listSessions(paired.serverOrigin)
        val agentsResult = operatorRepository.listAgents(paired.serverOrigin)

        val workspaces = workspacesResult.getOrNull()?.items.orEmpty().map { workspace ->
            WorkspaceRow(
                id = workspace.id,
                name = workspace.name,
                path = workspace.path,
                state = workspace.state,
            )
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
                catalog = collection.items.map { session -> session.toSessionRow() }
                _uiState.update { current ->
                    current.copy(
                        sessions = catalog,
                        sessionsLoading = false,
                        sessionsError = null,
                    )
                }
                publishDerivedSessionLists()
                syncActiveSessionsFromUiState()
                restoreLastSession()
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(
                        sessionsLoading = false,
                        sessionsError = errorMessage(error),
                    )
                }
            },
        )
    }

    private fun publishDerivedSessionLists() {
        val search = _uiState.value.sessionsListSearch.trim()
        val recent = catalog
            .sortedByDescending { row -> row.updatedAt }
            .take(RECENT_SESSIONS_LIMIT)
        val list = if (search.isEmpty()) {
            catalog.sortedByDescending { row -> row.updatedAt }
        } else {
            catalog
                .filter { row -> row.name.contains(search, ignoreCase = true) }
                .sortedByDescending { row -> row.updatedAt }
        }
        _uiState.update { current ->
            current.copy(
                recentSessions = recent,
                sessionsList = list,
            )
        }
    }

    private suspend fun restoreLastSession() {
        if (_uiState.value.isDraftNewSession) {
            return
        }

        val savedId = savedStateHandle.get<String>(KEY_SELECTED_SESSION_ID)
            ?: navigationPreferences.loadLastSessionId()
            ?: return

        val row = catalog.firstOrNull { session -> session.id == savedId }
            ?: catalog.firstOrNull { session -> session.sessionId == savedId }
            ?: return
        if (_uiState.value.selectedSession?.id == row.id) {
            sessionOwner.watch(row.agentId, row.sessionId)
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

    private suspend fun loadCreateForm(serverOrigin: String): CreateSessionUiState {
        val workspaces = operatorRepository.listWorkspaces(serverOrigin).getOrNull()?.items.orEmpty()
            .map { workspace ->
                WorkspaceRow(
                    id = workspace.id,
                    name = workspace.name,
                    path = workspace.path,
                    state = workspace.state,
                )
            }
            .filter { workspace -> workspace.state == WorkspaceState.Available }

        val agents = operatorRepository.listAgents(serverOrigin).getOrNull()?.items.orEmpty()
            .filter { agent -> agent.enabled }
            .map { agent -> AgentOption(id = agent.id, displayName = agent.displayName) }

        return CreateSessionUiState(
            workspaces = workspaces,
            agents = agents,
            selectedWorkspaceId = workspaces.firstOrNull()?.id.orEmpty(),
            selectedAgentId = agents.firstOrNull()?.id,
        )
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
        publishDerivedSessionLists()
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
        publishDerivedSessionLists()
        syncActiveSessionsFromUiState()
    }

    private fun syncActiveSessionsFromUiState() {
        val tracker = activeSessionTracker ?: return
        tracker.replaceAll(
            catalog.map { row ->
                ActiveSessionSnapshot(id = row.sessionId, name = row.name, state = row.state)
            },
        )
        sessionForegroundCoordinator?.onSessionsChanged()
    }

    private fun createSessionFromComposer(
        session: SessionRow,
        prompt: String,
        attachments: List<AttachmentReference> = emptyList(),
    ) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        clearComposer()
        _uiState.update { current ->
            current.copy(
                composerText = "",
                composerSubmitting = true,
                composerError = null,
            )
        }

        viewModelScope.launch {
            val result = operatorRepository.createSession(
                serverOrigin = paired.serverOrigin,
                body = CreateSessionBody(
                    agentId = session.agentId,
                    cwd = session.cwd,
                ),
            )

            result.fold(
                onSuccess = { created ->
                    rememberCreatedConfig(created)
                    val row = created.toSession().toSessionRow()
                    adoptCreatedSession(row)
                    _uiState.update { current -> current.copy(composerSubmitting = false) }
                    sessionOwner.prompt(prompt, attachments)
                    _uiState.update { current ->
                        current.copy(pendingAttachments = emptyList())
                    }
                    syncActiveSessionsFromUiState()
                    hydrateAgentAuth(row.agentId)
                    refreshCatalog()
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            composerSubmitting = false,
                            composerError = errorMessage(error),
                            transcript = emptyAcpTranscript,
                        )
                    }
                },
            )
        }
    }

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

    private suspend fun adoptCreatedSession(row: SessionRow) {
        navigationPreferences.saveLastSessionId(row.id)
        persistSelectedSession(row.id)
        _uiState.update { current ->
            current.copy(
                selectedSession = row,
                pendingPermissions = emptyList(),
                permissionUiState = PermissionUiState(),
                extensionUiState = ExtensionUiState(),
                streamReconnecting = false,
                agentAuth = null,
                agentAuthSummary = agentAuthSummaries[row.agentId],
                authPanelSubmitting = false,
                authActionBusy = false,
                authError = null,
            )
        }
        sessionOwner.watch(row.agentId, row.sessionId)
    }

    private fun Session.toSessionRow(): SessionRow {
        val workspace = workspaceByPath[cwd]
        return SessionRow(
            sessionId = sessionId,
            name = title.ifBlank { sessionId },
            cwd = cwd,
            workspaceId = workspace?.id.orEmpty(),
            workspaceLabel = workspace?.name ?: cwd,
            agentId = agentId,
            agentLabel = agentLabels[agentId] ?: agentId,
            state = SessionState.Idle,
            updatedAt = updatedAt,
        )
    }

    private fun errorMessage(error: Throwable): String =
        when (val apiError = (error as? AgentApiException)?.error) {
            is AgentApiError.Unauthorized -> apiError.detail ?: "Authentication required"
            is AgentApiError.Problem -> apiError.detail ?: apiError.title
            is AgentApiError.Decode -> "Unexpected response from Harold"
            is AgentApiError.Transport -> "Could not reach Harold"
            null -> error.message ?: "Request failed"
        }

    override fun onCleared() {
        voiceDictationController.destroy()
        sessionOwner.watch(null, null)
        super.onCleared()
    }

    companion object {
        const val KEY_SELECTED_SESSION_ID = "selected_session_id"
        const val RECENT_SESSIONS_LIMIT = 5
    }
}

class ChatViewModelFactory(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val sessionOwner: SessionOwner,
    private val operatorRepository: OperatorRepository,
    private val attachmentApi: AttachmentApi,
    private val configApi: SessionConfigApi,
    private val navigationPreferences: NavigationPreferences,
    private val activeSessionTracker: ActiveSessionTracker,
    private val sessionForegroundCoordinator: SessionForegroundCoordinator,
    private val openSessionRequests: OpenSessionRequests,
    private val voiceDictationController: VoiceDictationController,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ChatViewModel::class.java)) {
            return ChatViewModel(
                savedStateHandle = savedStateHandle,
                sessionGateway = sessionGateway,
                sessionOwner = sessionOwner,
                operatorRepository = operatorRepository,
                attachmentApi = attachmentApi,
                configApi = configApi,
                navigationPreferences = navigationPreferences,
                activeSessionTracker = activeSessionTracker,
                sessionForegroundCoordinator = sessionForegroundCoordinator,
                openSessionRequests = openSessionRequests,
                voiceDictationController = voiceDictationController,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
