package server.agent.android.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
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
    onDismissSessionMenu: () -> Unit,
    onWorkspacesClick: () -> Unit,
    onSessionClick: (SessionRow) -> Unit,
    onSeeAllSessionsClick: () -> Unit,
    onCreateClick: () -> Unit,
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
    onArchiveFromEditDialog: () -> Unit = {},
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
                            modifier = Modifier.testTag("session_menu"),
                        ) {
                            DropdownMenuItem(
                                text = { Text(text = stringResource(R.string.chat_new_session)) },
                                onClick = {
                                    onDismissSessionMenu()
                                    onCreateClick()
                                },
                                modifier = Modifier.testTag("session_menu_new"),
                            )

                            if (uiState.recentSessionsLoading) {
                                DropdownMenuItem(
                                    text = { Text(text = "Loading…") },
                                    onClick = {},
                                    enabled = false,
                                    modifier = Modifier.testTag("session_menu_loading"),
                                )
                            } else if (uiState.recentSessionsError != null) {
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = uiState.recentSessionsError,
                                            color = MaterialTheme.colorScheme.error,
                                        )
                                    },
                                    onClick = {},
                                    enabled = false,
                                    modifier = Modifier.testTag("session_menu_error"),
                                )
                            } else {
                                uiState.recentSessions.forEach { session ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                text = if (uiState.selectedSession?.id == session.id) {
                                                    "✓ ${session.name}"
                                                } else {
                                                    session.name
                                                },
                                            )
                                        },
                                        onClick = {
                                            onDismissSessionMenu()
                                            onSessionClick(session)
                                        },
                                        modifier = Modifier.testTag("session_menu_row_${session.id}"),
                                    )
                                }
                            }

                            DropdownMenuItem(
                                text = { Text(text = stringResource(R.string.sessions_see_all)) },
                                onClick = {
                                    onDismissSessionMenu()
                                    onSeeAllSessionsClick()
                                },
                                modifier = Modifier.testTag("session_menu_see_all"),
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

                val slashQuery = activeSlashQuery(uiState.composerText)
                val slashMatches = slashQuery?.let { query -> filterSlashStubs(query) }

                if (slashMatches != null) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("slash_stub_menu"),
                    ) {
                        if (slashMatches.isEmpty()) {
                            Text(
                                text = "No matching commands",
                                modifier = Modifier
                                    .padding(12.dp)
                                    .testTag("slash_stub_empty"),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            LazyColumn(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 180.dp),
                            ) {
                                items(slashMatches, key = { command -> command.id }) { command ->
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                onComposerTextChanged(
                                                    insertSlashStub(
                                                        uiState.composerText,
                                                        command.name,
                                                    ),
                                                )
                                            }
                                            .padding(horizontal = 12.dp, vertical = 10.dp)
                                            .testTag("slash_stub_item_${command.id}"),
                                    ) {
                                        Text(
                                            text = "/${command.name}",
                                            style = MaterialTheme.typography.titleSmall,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        Text(
                                            text = command.description,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    val composerEnabled = uiState.composerEnabled
                    val composerInteractionSource = remember { MutableInteractionSource() }
                    val composerColors = OutlinedTextFieldDefaults.colors()
                    val composerTextColor = if (composerEnabled) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                    }

                    BasicTextField(
                        value = uiState.composerText,
                        onValueChange = onComposerTextChanged,
                        enabled = composerEnabled,
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = composerTextColor),
                        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                        interactionSource = composerInteractionSource,
                        minLines = 1,
                        maxLines = 4,
                        modifier = Modifier
                            .weight(1f)
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("chat_composer"),
                        decorationBox = { innerTextField ->
                            OutlinedTextFieldDefaults.DecorationBox(
                                value = uiState.composerText,
                                innerTextField = innerTextField,
                                enabled = composerEnabled,
                                singleLine = false,
                                visualTransformation = VisualTransformation.None,
                                interactionSource = composerInteractionSource,
                                placeholder = { Text(text = "Message") },
                                colors = composerColors,
                                contentPadding = OutlinedTextFieldDefaults.contentPadding(
                                    start = 12.dp,
                                    top = 10.dp,
                                    end = 12.dp,
                                    bottom = 10.dp,
                                ),
                                container = {
                                    OutlinedTextFieldDefaults.Container(
                                        enabled = composerEnabled,
                                        isError = false,
                                        interactionSource = composerInteractionSource,
                                        colors = composerColors,
                                    )
                                },
                            )
                        },
                    )

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
                            Text(text = if (uiState.cancelSubmitting) "Canceling…" else "Cancel")
                        }
                    }

                    IconButton(
                        onClick = onComposerSubmit,
                        enabled = composerEnabled && uiState.composerText.isNotBlank(),
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("chat_send_button")
                            .semantics {
                                contentDescription = sendContentDescription
                            },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = null,
                        )
                    }
                }
            }
        }
    }

    if (uiState.renameDialogVisible) {
        SessionEditDialog(
            renameState = uiState.renameState,
            archiveSubmitting = uiState.archiveSubmitting,
            onDismiss = onDismissRename,
            onNameChanged = onRenameNameChanged,
            onSave = onRenameSubmit,
            onArchive = onArchiveFromEditDialog,
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
            modifier = Modifier.testTag("archive_session_dialog"),
        )
    }
}
