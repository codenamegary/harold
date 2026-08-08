package server.agent.android.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
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

private val MIN_TOUCH_TARGET = 48.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    uiState: ChatUiState,
    onSessionSelectorClick: () -> Unit,
    onWorkspacesClick: () -> Unit,
    onDismissPicker: () -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onRenameSessionClick: (SessionRow) -> Unit,
    onCreateClick: () -> Unit,
    onDismissCreate: () -> Unit,
    onCreateWorkspaceChanged: (String) -> Unit,
    onCreateAgentChanged: (server.agent.android.contracts.AgentId) -> Unit,
    onCreatePromptChanged: (String) -> Unit,
    onCreateSubmit: () -> Unit,
    onComposerTextChanged: (String) -> Unit,
    onComposerSubmit: () -> Unit,
    onComposerCancel: () -> Unit,
    onRenameClick: () -> Unit,
    onDismissRename: () -> Unit,
    onRenameNameChanged: (String) -> Unit,
    onRenameSubmit: () -> Unit,
    onArchiveClick: () -> Unit,
    onDismissArchive: () -> Unit,
    onArchiveSubmit: () -> Unit,
    onPermissionOptionSelect: (String) -> Unit,
    onNotificationPermissionResult: (Boolean) -> Unit = {},
    onDismissNotificationPermissionPrompt: () -> Unit = {},
) {
    var menuExpanded by remember { mutableStateOf(false) }
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
    val sendContentDescription = stringResource(R.string.chat_send_content_description)
    val cancelContentDescription = stringResource(R.string.chat_cancel_content_description)
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        onNotificationPermissionResult(granted)
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    TextButton(
                        onClick = onSessionSelectorClick,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("session_selector")
                            .semantics {
                                contentDescription = sessionSelectorContentDescription
                            },
                    ) {
                        Text(text = "$sessionLabel ▾")
                    }
                },
                actions = {
                    TextButton(
                        onClick = { menuExpanded = true },
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("chat_overflow")
                            .semantics {
                                contentDescription = overflowContentDescription
                            },
                    ) {
                        Text(text = "More")
                    }

                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        if (hasSelectedSession) {
                            DropdownMenuItem(
                                text = { Text(text = "Rename session") },
                                onClick = {
                                    menuExpanded = false
                                    onRenameClick()
                                },
                                modifier = Modifier.testTag("rename_menu_item"),
                            )
                            DropdownMenuItem(
                                text = { Text(text = "Archive session") },
                                onClick = {
                                    menuExpanded = false
                                    onArchiveClick()
                                },
                                modifier = Modifier.testTag("archive_menu_item"),
                            )
                        }
                        DropdownMenuItem(
                            text = { Text(text = "Workspaces") },
                            onClick = {
                                menuExpanded = false
                                onWorkspacesClick()
                            },
                            modifier = Modifier.testTag("workspaces_menu_item"),
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
                                    Button(
                                        onClick = onSessionSelectorClick,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET),
                                    ) {
                                        Text(text = stringResource(R.string.chat_select_session))
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
                            modifier = Modifier.fillMaxSize(),
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

                uiState.composerError?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.testTag("composer_error"),
                    )
                }

                OutlinedTextField(
                    value = uiState.composerText,
                    onValueChange = onComposerTextChanged,
                    enabled = uiState.composerEnabled,
                    label = { Text(text = "Message") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("chat_composer"),
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    if (uiState.showComposerCancel) {
                        TextButton(
                            onClick = onComposerCancel,
                            enabled = !uiState.cancelSubmitting,
                            modifier = Modifier
                                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                .testTag("chat_cancel_button")
                                .semantics {
                                    contentDescription = cancelContentDescription
                                },
                        ) {
                            Text(text = if (uiState.cancelSubmitting) "Canceling…" else "Cancel run")
                        }
                    }

                    TextButton(
                        onClick = onComposerSubmit,
                        enabled = uiState.composerEnabled && uiState.composerText.isNotBlank(),
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("chat_send_button")
                            .semantics {
                                contentDescription = sendContentDescription
                            },
                    ) {
                        Text(text = if (uiState.composerSubmitting) "Sending…" else "Send")
                    }
                }
            }
        }
    }

    if (uiState.pickerVisible) {
        SessionPickerSheet(
            uiState = uiState,
            onDismiss = onDismissPicker,
            onSessionClick = onSessionClick,
            onRenameSessionClick = onRenameSessionClick,
            onCreateClick = onCreateClick,
        )
    }

    if (uiState.createDialogVisible) {
        CreateSessionDialog(
            createState = uiState.createState,
            onDismiss = onDismissCreate,
            onWorkspaceChanged = onCreateWorkspaceChanged,
            onAgentChanged = onCreateAgentChanged,
            onPromptChanged = onCreatePromptChanged,
            onSubmit = onCreateSubmit,
        )
    }

    if (uiState.renameDialogVisible) {
        RenameSessionDialog(
            renameState = uiState.renameState,
            onDismiss = onDismissRename,
            onNameChanged = onRenameNameChanged,
            onSubmit = onRenameSubmit,
        )
    }

    if (uiState.archiveDialogVisible) {
        AlertDialog(
            onDismissRequest = onDismissArchive,
            title = { Text(text = "Archive session?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(text = "Archived sessions leave the active workflow.")
                    uiState.archiveError?.let { message ->
                        Text(
                            text = message,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.testTag("archive_error"),
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = onArchiveSubmit,
                    enabled = !uiState.archiveSubmitting,
                    modifier = Modifier.testTag("archive_confirm"),
                ) {
                    Text(text = if (uiState.archiveSubmitting) "Archiving…" else "Archive")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = onDismissArchive,
                    modifier = Modifier.testTag("archive_cancel"),
                ) {
                    Text(text = "Cancel")
                }
            },
        )
    }
}
