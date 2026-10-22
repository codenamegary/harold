package harold.android.chat

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import harold.android.ui.components.HaroldBadge
import harold.android.ui.components.HaroldButton
import harold.android.ui.components.HaroldButtonVariant
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
import androidx.core.content.ContextCompat
import harold.android.chat.auth.AgentAuthPanel
import harold.android.chat.composer.CommandListPanel
import harold.android.chat.composer.ComposerConfigActions
import harold.android.chat.composer.PromptComposer
import harold.android.chat.composer.activeCommandQuery
import harold.android.chat.composer.filterCommands
import harold.android.chat.composer.insertSlashShortcut
import harold.android.chat.composer.removeCommandToken
import harold.android.contracts.AuthSessionStatus
import harold.android.ui.promptinput.PromptEdit
import harold.android.voice.VoiceDictationPresentation

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
    leadingContent: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(SessionMenuItemPadding)
            .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        leadingContent?.invoke()
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge.copy(
                fontSize = 15.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.Medium,
            ),
            color = if (enabled) color else color.copy(alpha = 0.38f),
        )
    }
}

@Composable
private fun SessionDropdownItem(
    session: SessionRow,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val hasHaroldIdentity =
        session.haroldColorId.isNotEmpty() ||
            session.haroldIconId.isNotEmpty() ||
            session.haroldName.isNotEmpty()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .testTag("session_menu_row_${session.id}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (hasHaroldIdentity) {
            HaroldBadge(
                colorId = session.haroldColorId,
                iconId = session.haroldIconId,
                size = 22.dp,
                modifier = Modifier.testTag("session_menu_badge_${session.id}"),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = session.name,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                ),
                color = if (selected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (session.needsAttention) {
                Text(
                    text = "Needs permission",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        if (selected) {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.requiredSize(18.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    uiState: ChatUiState,
    composerState: TextFieldState = rememberTextFieldState(),
    composerActions: ComposerConfigActions = ComposerConfigActions(),
    onSessionSelectorClick: () -> Unit = {},
    onDismissSessionMenu: () -> Unit = {},
    onWorkspacesClick: () -> Unit = {},
    onSessionClick: (SessionRow) -> Unit = {},
    onSeeAllSessionsClick: () -> Unit = {},
    onCreateClick: () -> Unit = {},
    onAttachmentsPicked: (List<AttachmentPick>) -> Unit = {},
    onRemoveAttachment: (String) -> Unit = {},
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
    onPairAnotherHarold: () -> Unit = {},
    onSavedHarolds: () -> Unit = {},
) {
    var menuExpanded by remember { mutableStateOf(false) }
    var disconnectConfirmVisible by remember { mutableStateOf(false) }
    val composerText = composerState.text.toString()
    val attachmentContext = LocalContext.current
    val photoPickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = 5),
    ) { uris ->
        if (uris.isEmpty()) {
            return@rememberLauncherForActivityResult
        }
        val picks = uris.mapNotNull { uri ->
            readAttachmentPick(attachmentContext, uri, fallbackMime = "image/jpeg")
        }
        onAttachmentsPicked(picks)
    }
    val documentPickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        if (uris.isEmpty()) {
            return@rememberLauncherForActivityResult
        }
        val picks = uris.mapNotNull { uri ->
            readAttachmentPick(attachmentContext, uri, fallbackMime = "application/octet-stream")
        }
        onAttachmentsPicked(picks)
    }
    val composerSelection = composerState.selection
    val selected = uiState.selectedSession
    val sessionLabel = selected?.name ?: "Select session"
    val hasSelectedSession = selected != null
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

    val disconnectName = uiState.disconnectHaroldName
    val disconnectColorId = uiState.disconnectHaroldColorId
    val disconnectIconId = uiState.disconnectHaroldIconId
    val hasDisconnectBadge =
        disconnectColorId.isNotEmpty() ||
            disconnectIconId.isNotEmpty() ||
            disconnectName.isNotEmpty()
    val disconnectLabel = if (disconnectName.isNotEmpty()) {
        stringResource(R.string.chat_disconnect_server_named, disconnectName)
    } else {
        stringResource(R.string.chat_disconnect_from_server)
    }

    if (disconnectConfirmVisible) {
        AlertDialog(
            onDismissRequest = { disconnectConfirmVisible = false },
            title = {
                Text(
                    text = if (disconnectName.isNotEmpty()) {
                        stringResource(R.string.chat_disconnect_confirm_title_named, disconnectName)
                    } else {
                        stringResource(R.string.chat_disconnect_confirm_title)
                    },
                )
            },
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
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                if (
                                    selected != null &&
                                    (
                                        selected.haroldColorId.isNotEmpty() ||
                                            selected.haroldIconId.isNotEmpty() ||
                                            selected.haroldName.isNotEmpty()
                                        )
                                ) {
                                    HaroldBadge(
                                        colorId = selected.haroldColorId,
                                        iconId = selected.haroldIconId,
                                        size = 24.dp,
                                        modifier = Modifier.testTag("chat_session_harold_badge"),
                                    )
                                }
                                Text(
                                    text = sessionLabel,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("chat_session_label"),
                                )
                                Icon(
                                    imageVector = Icons.Filled.ArrowDropDown,
                                    contentDescription = null,
                                    modifier = Modifier.requiredSize(28.dp),
                                )
                            }
                        }

                        DropdownMenu(
                            expanded = uiState.pickerVisible,
                            onDismissRequest = onDismissSessionMenu,
                            modifier = Modifier
                                .widthIn(min = SessionMenuMinWidth, max = 340.dp)
                                .testTag("session_menu"),
                        ) {
                            SessionMenuRow(
                                text = stringResource(R.string.chat_new_session),
                                onClick = {
                                    onDismissSessionMenu()
                                    onCreateClick()
                                },
                                color = MaterialTheme.colorScheme.primary,
                                leadingContent = {
                                    Icon(
                                        imageVector = Icons.Filled.Add,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.requiredSize(20.dp),
                                    )
                                },
                                testTag = "session_menu_new",
                            )

                            HorizontalDivider(
                                modifier = Modifier.padding(vertical = 4.dp),
                                color = MaterialTheme.colorScheme.outlineVariant,
                            )

                            if (uiState.recentSessionsLoading && uiState.recentSessions.isEmpty()) {
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
                                    SessionDropdownItem(
                                        session = session,
                                        selected = uiState.selectedSession?.id == session.id,
                                        onClick = {
                                            onDismissSessionMenu()
                                            onSessionClick(session)
                                        },
                                    )
                                }
                            }

                            HorizontalDivider(
                                modifier = Modifier.padding(vertical = 4.dp),
                                color = MaterialTheme.colorScheme.outlineVariant,
                            )

                            SessionMenuRow(
                                text = stringResource(R.string.sessions_see_all),
                                onClick = {
                                    onDismissSessionMenu()
                                    onSeeAllSessionsClick()
                                },
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                            text = { Text(text = stringResource(R.string.chat_saved_harolds)) },
                            onClick = {
                                menuExpanded = false
                                onSavedHarolds()
                            },
                            modifier = Modifier.testTag("saved_harolds_menu_item"),
                        )
                        DropdownMenuItem(
                            text = { Text(text = stringResource(R.string.chat_pair_another_harold)) },
                            onClick = {
                                menuExpanded = false
                                onPairAnotherHarold()
                            },
                            modifier = Modifier.testTag("pair_another_menu_item"),
                        )
                        DropdownMenuItem(
                            leadingIcon = if (hasDisconnectBadge) {
                                {
                                    HaroldBadge(
                                        colorId = disconnectColorId,
                                        iconId = disconnectIconId,
                                        size = 20.dp,
                                        modifier = Modifier.testTag("disconnect_menu_badge"),
                                    )
                                }
                            } else {
                                null
                            },
                            text = {
                                Text(text = disconnectLabel)
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
                                        verticalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        HaroldButton(
                                            text = stringResource(R.string.chat_new_session),
                                            onClick = onCreateClick,
                                            variant = HaroldButtonVariant.Primary,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .testTag("new_session_cta"),
                                        )
                                        HaroldButton(
                                            text = stringResource(R.string.chat_select_session),
                                            onClick = onSessionSelectorClick,
                                            variant = HaroldButtonVariant.Secondary,
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                        HaroldButton(
                                            text = disconnectLabel,
                                            onClick = { disconnectConfirmVisible = true },
                                            variant = HaroldButtonVariant.Ghost,
                                            leadingIcon = if (hasDisconnectBadge) {
                                                {
                                                    HaroldBadge(
                                                        colorId = disconnectColorId,
                                                        iconId = disconnectIconId,
                                                        size = 20.dp,
                                                    )
                                                }
                                            } else {
                                                null
                                            },
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .testTag("disconnect_cta"),
                                        )
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
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                    config = uiState.composerConfig,
                    configActions = composerActions,
                    showCancel = uiState.showComposerCancel,
                    cancelSubmitting = uiState.cancelSubmitting,
                    supportsImages = uiState.supportsImageAttachments,
                    supportsFiles = uiState.supportsFileAttachments,
                    pendingAttachments = uiState.pendingAttachments,
                    onAttachPhoto = {
                        if (uiState.supportsImageAttachments) {
                            photoPickerLauncher.launch(
                                PickVisualMediaRequest(
                                    ActivityResultContracts.PickVisualMedia.ImageOnly,
                                ),
                            )
                        }
                    },
                    onAttachFiles = {
                        if (uiState.supportsFileAttachments) {
                            documentPickerLauncher.launch(arrayOf("*/*"))
                        }
                    },
                    onRemoveAttachment = onRemoveAttachment,
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

/** A file handed from the pickers to the view model: bytes read, metadata resolved. */
data class AttachmentPick(
    val name: String,
    val mimeType: String,
    val bytes: ByteArray,
)

private fun readAttachmentPick(
    context: android.content.Context,
    uri: android.net.Uri,
    fallbackMime: String,
): AttachmentPick? {
    val resolver = context.contentResolver
    val name = try {
        android.provider.OpenableColumns.DISPLAY_NAME.let {
            resolver.query(uri, arrayOf(it), null, null, null)?.use { cursor ->
                val index = cursor.getColumnIndex(it)
                if (cursor.moveToFirst() && index >= 0) cursor.getString(index) else null
            }
        } ?: "attachment"
    } catch (_: Throwable) {
        "attachment"
    }
    val mimeType = resolver.getType(uri) ?: fallbackMime
    val bytes = try {
        resolver.openInputStream(uri)?.use { stream -> stream.readBytes() } ?: return null
    } catch (_: Throwable) {
        return null
    }
    return AttachmentPick(name = name, mimeType = mimeType, bytes = bytes)
}
