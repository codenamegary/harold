package server.agent.android.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import server.agent.android.R
import server.agent.android.chat.auth.AgentAuthPanel
import server.agent.android.chat.composer.CommandListPanel
import server.agent.android.chat.composer.PromptComposer
import server.agent.android.chat.composer.activeCommandQuery
import server.agent.android.chat.composer.filterCommands
import server.agent.android.chat.composer.insertSlashShortcut
import server.agent.android.chat.composer.removeCommandToken
import server.agent.android.contracts.AuthSessionStatus
import server.agent.android.ui.promptinput.PromptEdit

private val MIN_TOUCH_TARGET = 48.dp
private val SessionMenuItemPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
private val SessionMenuMinWidth = 280.dp

@Composable
private fun SessionMenuRow(
    text: String,
    onClick: () -> Unit,
    testTag: String,
    enabled: Boolean = true,
    color: Color = MaterialTheme.colorScheme.onSurface,
) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyLarge.copy(
            fontSize = 16.sp,
            lineHeight = 24.sp,
            fontWeight = FontWeight.Medium,
        ),
        color = if (enabled) color else color.copy(alpha = 0.38f),
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(SessionMenuItemPadding)
            .testTag(testTag),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    uiState: ChatUiState,
    composerState: TextFieldState = rememberTextFieldState(),
    onSessionSelectorClick: () -> Unit = {},
    onDismissSessionMenu: () -> Unit = {},
    onWorkspacesClick: () -> Unit = {},
    onSessionClick: (SessionRow) -> Unit = {},
    onSeeAllSessionsClick: () -> Unit = {},
    onCreateClick: () -> Unit = {},
    onComposerTextChanged: (String) -> Unit = {},
    onComposerEdit: (PromptEdit) -> Unit = {},
    onComposerSubmit: () -> Unit = {},
    onComposerCancel: () -> Unit = {},
    onPermissionOptionSelect: (String) -> Unit = {},
    onExtensionReplyChanged: (String) -> Unit = {},
    onExtensionReply: () -> Unit = {},
    onExtensionSkip: () -> Unit = {},
    onNotificationPermissionResult: (Boolean) -> Unit = {},
    onDismissNotificationPermissionPrompt: () -> Unit = {},
    onVoiceDictationOpen: (hasRecordAudioPermission: Boolean) -> Unit = {},
    onRecordAudioPermissionResult: (Boolean) -> Unit = {},
    onVoiceDictationToggleListening: () -> Unit = {},
    onVoiceDictationStartOver: () -> Unit = {},
    onVoiceDictationCancel: () -> Unit = {},
    onVoiceDictationConfirm: () -> Unit = {},
    onVoiceDictationExpand: () -> Unit = {},
    onVoiceDictationCollapse: () -> Unit = {},
    onVoiceSubmit: () -> Unit = {},
    onVoiceCommandToggle: () -> Unit = {},
    onVoiceCommandDismiss: () -> Unit = {},
    onVoiceCommandPick: (String) -> Unit = {},
    onComposerCommandPick: (String) -> Unit = {},
    onAuthSignIn: () -> Unit = {},
    onAuthConfirm: (String) -> Unit = {},
    onAuthCancel: () -> Unit = {},
    onAuthLogout: () -> Unit = {},
    onDisconnectFromServer: () -> Unit = {},
) {
    var menuExpanded by remember { mutableStateOf(false) }
    var disconnectConfirmVisible by remember { mutableStateOf(false) }
    val composerText = composerState.text.toString()
    val composerSelection = composerState.selection
    val sessionLabel = uiState.selectedSession?.name ?: "Select session"
    val hasSelectedSession = uiState.selectedSession != null
    val context = LocalContext.current
    val sessionSelectorContentDescription = stringResource(
        R.string.chat_session_selector_content_description,
        sessionLabel,
    )
    val overflowContentDescription = stringResource(R.string.chat_overflow_content_description)
    val openSettingsContentDescription =
        stringResource(R.string.notification_permission_open_settings_content_description)
    val notNowContentDescription =
        stringResource(R.string.notification_permission_not_now_content_description)
    val voiceMicEnabledContentDescription =
        stringResource(R.string.chat_voice_mic_content_description)
    val voiceMicDisabledComposerContentDescription =
        stringResource(R.string.chat_voice_mic_disabled_composer_content_description)
    val voiceMicUnavailableContentDescription =
        stringResource(R.string.chat_voice_mic_unavailable_content_description)
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        onNotificationPermissionResult(granted)
    }
    val recordAudioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        onRecordAudioPermissionResult(granted)
    }

    fun hasRecordAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

    fun openAppPermissionSettings() {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", context.packageName, null),
        )
        context.startActivity(intent)
    }

    fun requestRecordAudioPermission() {
        recordAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    fun openVoiceDictation() {
        val granted = hasRecordAudioPermission()
        onVoiceDictationOpen(granted)
        if (!granted) {
            requestRecordAudioPermission()
        }
    }

    LaunchedEffect(uiState.notificationPermissionDenied) {
        if (
            uiState.notificationPermissionDenied &&
            Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    if (uiState.notificationPermissionDenied) {
        AlertDialog(
            onDismissRequest = onDismissNotificationPermissionPrompt,
            title = { Text(text = stringResource(R.string.notification_permission_title)) },
            text = { Text(text = stringResource(R.string.notification_permission_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        val intent = Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null),
                        )
                        context.startActivity(intent)
                    },
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("notification_permission_settings")
                        .semantics {
                            contentDescription = openSettingsContentDescription
                        },
                ) {
                    Text(text = stringResource(R.string.notification_permission_open_settings))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = onDismissNotificationPermissionPrompt,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("notification_permission_dismiss")
                        .semantics {
                            contentDescription = notNowContentDescription
                        },
                ) {
                    Text(text = stringResource(R.string.notification_permission_not_now))
                }
            },
            modifier = Modifier.testTag("notification_permission_dialog"),
        )
    }

    if (disconnectConfirmVisible) {
        AlertDialog(
            onDismissRequest = { disconnectConfirmVisible = false },
            title = { Text(text = stringResource(R.string.chat_disconnect_confirm_title)) },
            text = { Text(text = stringResource(R.string.chat_disconnect_confirm_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        disconnectConfirmVisible = false
                        onDisconnectFromServer()
                    },
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("disconnect_confirm"),
                ) {
                    Text(text = stringResource(R.string.chat_disconnect_confirm))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { disconnectConfirmVisible = false },
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("disconnect_cancel"),
                ) {
                    Text(text = stringResource(R.string.chat_disconnect_cancel))
                }
            },
            modifier = Modifier.testTag("disconnect_confirm_dialog"),
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Box {
                        TextButton(
                            onClick = onSessionSelectorClick,
                            colors = ButtonDefaults.textButtonColors(
                                contentColor = MaterialTheme.colorScheme.onSurface,
                            ),
                            modifier = Modifier
                                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                .testTag("session_selector")
                                .semantics {
                                    contentDescription = sessionSelectorContentDescription
                                },
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                Text(
                                    text = sessionLabel,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                Icon(
                                    imageVector = Icons.Filled.ArrowDropDown,
                                    contentDescription = null,
                                    modifier = Modifier.requiredSize(36.dp),
                                )
                            }
                        }

                        DropdownMenu(
                            expanded = uiState.pickerVisible,
                            onDismissRequest = onDismissSessionMenu,
                            modifier = Modifier
                                .widthIn(min = SessionMenuMinWidth)
                                .testTag("session_menu"),
                        ) {
                            SessionMenuRow(
                                text = stringResource(R.string.chat_new_session),
                                onClick = {
                                    onDismissSessionMenu()
                                    onCreateClick()
                                },
                                testTag = "session_menu_new",
                            )

                            if (uiState.recentSessionsLoading) {
                                SessionMenuRow(
                                    text = "Loading…",
                                    onClick = {},
                                    enabled = false,
                                    testTag = "session_menu_loading",
                                )
                            } else if (uiState.recentSessionsError != null) {
                                SessionMenuRow(
                                    text = uiState.recentSessionsError,
                                    onClick = {},
                                    enabled = false,
                                    color = MaterialTheme.colorScheme.error,
                                    testTag = "session_menu_error",
                                )
                            } else {
                                uiState.recentSessions.forEach { session ->
                                    SessionMenuRow(
                                        text = if (uiState.selectedSession?.id == session.id) {
                                            "✓ ${session.name}"
                                        } else {
                                            session.name
                                        },
                                        onClick = {
                                            onDismissSessionMenu()
                                            onSessionClick(session)
                                        },
                                        testTag = "session_menu_row_${session.id}",
                                    )
                                }
                            }

                            SessionMenuRow(
                                text = stringResource(R.string.sessions_see_all),
                                onClick = {
                                    onDismissSessionMenu()
                                    onSeeAllSessionsClick()
                                },
                                testTag = "session_menu_see_all",
                            )
                        }
                    }
                },
                actions = {
                    IconButton(
                        onClick = { menuExpanded = true },
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("chat_overflow")
                            .semantics {
                                contentDescription = overflowContentDescription
                            },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.MoreVert,
                            contentDescription = null,
                        )
                    }

                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text(text = "Workspaces") },
                            onClick = {
                                menuExpanded = false
                                onWorkspacesClick()
                            },
                            modifier = Modifier.testTag("workspaces_menu_item"),
                        )
                        if (uiState.authSummary?.canLogout == true) {
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = if (uiState.authActionBusy) {
                                            stringResource(R.string.agent_auth_signing_out)
                                        } else {
                                            stringResource(R.string.agent_auth_sign_out)
                                        },
                                    )
                                },
                                onClick = {
                                    menuExpanded = false
                                    onAuthLogout()
                                },
                                enabled = !uiState.authActionBusy &&
                                    !uiState.authPanelSubmitting &&
                                    uiState.agentAuth?.session?.status != AuthSessionStatus.InProgress,
                                modifier = Modifier.testTag("auth_sign_out_menu_item"),
                            )
                        }
                        DropdownMenuItem(
                            text = {
                                Text(text = stringResource(R.string.chat_disconnect_from_server))
                            },
                            onClick = {
                                menuExpanded = false
                                disconnectConfirmVisible = true
                            },
                            modifier = Modifier.testTag("disconnect_menu_item"),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding)
                .imePadding()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (uiState.connectionBanner != null) {
                Text(
                    text = uiState.connectionBanner,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .testTag("connection_banner")
                        .semantics {
                            liveRegion = LiveRegionMode.Polite
                        },
                )
            }

            if (uiState.streamReconnecting) {
                Text(
                    text = "Reconnecting session stream…",
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .testTag("stream_reconnect_banner")
                        .semantics {
                            liveRegion = LiveRegionMode.Polite
                        },
                )
            }

            if (hasSelectedSession && uiState.showAuthPanel) {
                val summary = uiState.authSummary
                val selected = uiState.selectedSession
                if (summary != null && selected != null) {
                    AgentAuthPanel(
                        agentName = selected.agentLabel.ifBlank { selected.agentId },
                        summary = summary,
                        auth = uiState.agentAuth,
                        submitting = uiState.authPanelSubmitting,
                        actionBusy = uiState.authActionBusy,
                        error = uiState.authError,
                        onSignIn = onAuthSignIn,
                        onConfirm = onAuthConfirm,
                        onCancel = onAuthCancel,
                    )
                }
            }

            uiState.cancelError?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("cancel_error"),
                )
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = if (
                    uiState.showEmptyWelcome || uiState.showSelectSessionCta
                ) {
                    Alignment.Center
                } else {
                    Alignment.TopStart
                },
            ) {
                when {
                    uiState.showSelectSessionCta -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("select_session_cta"),
                            contentAlignment = Alignment.Center,
                        ) {
                            WelcomeMessage(
                                body = stringResource(R.string.chat_welcome_select_session_body),
                                action = {
                                    Column(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Button(
                                            onClick = onCreateClick,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                                .testTag("new_session_cta"),
                                        ) {
                                            Text(text = stringResource(R.string.chat_new_session))
                                        }
                                        TextButton(
                                            onClick = onSessionSelectorClick,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .defaultMinSize(minHeight = MIN_TOUCH_TARGET),
                                        ) {
                                            Text(text = stringResource(R.string.chat_select_session))
                                        }
                                        TextButton(
                                            onClick = { disconnectConfirmVisible = true },
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                                .testTag("disconnect_cta"),
                                        ) {
                                            Text(
                                                text = stringResource(
                                                    R.string.chat_disconnect_from_server,
                                                ),
                                            )
                                        }
                                    }
                                },
                            )
                        }
                    }

                    else -> {
                        ChatTranscript(
                            rows = uiState.transcript.rows,
                            isRunning = uiState.showProgress || uiState.composerSubmitting,
                            showWelcome = uiState.showEmptyWelcome,
                            hasPendingPermission = uiState.activePermissionRequest != null,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }

                // Command list takes over the conversation area. In keyboard
                // mode the command token under the caret opens it and filters
                // it; in inline voice mode the rail's / button toggles the
                // full list.
                val inVoiceMode = uiState.composerInVoiceMode
                val textCommandQuery = if (inVoiceMode) {
                    null
                } else {
                    activeCommandQuery(composerText, composerSelection)
                }
                val commandsAvailable = uiState.availableCommands.isNotEmpty()
                when {
                    hasSelectedSession && commandsAvailable && textCommandQuery != null -> {
                        CommandListPanel(
                            commands = filterCommands(uiState.availableCommands, textCommandQuery),
                            onPick = onComposerCommandPick,
                            onClose = {
                                onComposerEdit(
                                    removeCommandToken(composerText, composerSelection),
                                )
                            },
                        )
                    }
                    hasSelectedSession && commandsAvailable && inVoiceMode &&
                        uiState.voiceCommandListVisible &&
                        uiState.voiceDictation.presentation == VoiceDictationPresentation.Inline -> {
                        CommandListPanel(
                            commands = uiState.availableCommands,
                            onPick = onVoiceCommandPick,
                            onClose = onVoiceCommandDismiss,
                        )
                    }
                }
            }

            if (hasSelectedSession) {
                uiState.composerBlockedMessage?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.testTag("composer_blocked_message"),
                    )
                }

                uiState.activePermissionRequest?.let { request ->
                    val sessionName = uiState.selectedSession?.name ?: "Session"
                    PermissionPanel(
                        request = request,
                        sessionName = sessionName,
                        submittingOptionId = uiState.permissionUiState.submittingOptionId,
                        error = uiState.permissionUiState.error,
                        onSelectOption = onPermissionOptionSelect,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }

                if (uiState.extensionUiState.request != null) {
                    ExtensionPanel(
                        uiState = uiState.extensionUiState,
                        onReplyChanged = onExtensionReplyChanged,
                        onReply = onExtensionReply,
                        onSkip = onExtensionSkip,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }

                uiState.composerError?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.testTag("composer_error"),
                    )
                }

                val composerEnabled = uiState.composerEnabled
                val voiceMicEnabled =
                    composerEnabled && uiState.voiceDictation.recognizerAvailable
                val voiceMicContentDescription = when {
                    !uiState.voiceDictation.recognizerAvailable ->
                        voiceMicUnavailableContentDescription
                    !composerEnabled ->
                        voiceMicDisabledComposerContentDescription
                    else ->
                        voiceMicEnabledContentDescription
                }

                PromptComposer(
                    composerState = composerState,
                    composerEnabled = composerEnabled,
                    showCancel = uiState.showComposerCancel,
                    cancelSubmitting = uiState.cancelSubmitting,
                    voice = uiState.voiceDictation,
                    voiceMicEnabled = voiceMicEnabled,
                    micContentDescription = voiceMicContentDescription,
                    voiceMessage = uiState.voiceMessage,
                    voiceCommandPrefix = uiState.voiceCommandPrefix,
                    voiceCommandListVisible = uiState.voiceCommandListVisible,
                    onSubmit = onComposerSubmit,
                    onCancel = onComposerCancel,
                    onMicClick = { openVoiceDictation() },
                    onSlashClick = {
                        onComposerTextChanged(insertSlashShortcut(composerText))
                    },
                    onVoiceKeyboard = onVoiceDictationConfirm,
                    onVoiceExpand = onVoiceDictationExpand,
                    onVoiceToggleListening = onVoiceDictationToggleListening,
                    onVoiceCommandToggle = onVoiceCommandToggle,
                    onVoiceSubmit = onVoiceSubmit,
                )
            }
        }
    }

    VoiceDictationOverlay(
        state = uiState.voiceDictation,
        commandPrefix = uiState.voiceCommandPrefix,
        commands = uiState.availableCommands,
        commandListVisible = uiState.voiceCommandListVisible &&
            uiState.availableCommands.isNotEmpty(),
        onToggleListening = onVoiceDictationToggleListening,
        onStartOver = onVoiceDictationStartOver,
        onCancel = onVoiceDictationCancel,
        onCollapse = onVoiceDictationCollapse,
        onKeyboard = onVoiceDictationConfirm,
        onSend = onVoiceSubmit,
        onCommandToggle = onVoiceCommandToggle,
        onCommandPick = onVoiceCommandPick,
        onCommandDismiss = onVoiceCommandDismiss,
        onRequestPermission = { requestRecordAudioPermission() },
        onOpenPermissionSettings = { openAppPermissionSettings() },
    )
    }
}
