package server.agent.android.chat

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import server.agent.android.R

private val MIN_TOUCH_TARGET = 48.dp

@Composable
fun VoiceDictationOverlay(
    state: VoiceDictationUiState,
    onToggleListening: () -> Unit,
    onStartOver: () -> Unit,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
    onRequestPermission: () -> Unit,
    onOpenPermissionSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!state.visible) {
        return
    }

    val micScale by animateFloatAsState(
        targetValue = if (state.isListening) {
            1f + (state.audioLevel.coerceIn(0f, 1f) * 0.4f)
        } else {
            1f
        },
        animationSpec = spring(),
        label = "voice_mic_pulse",
    )
    val micContentDescription = if (state.isListening) {
        stringResource(R.string.voice_dictation_mute_content_description)
    } else {
        stringResource(R.string.voice_dictation_unmute_content_description)
    }
    val listeningLabel = if (state.isListening) {
        stringResource(R.string.voice_dictation_listening)
    } else {
        stringResource(R.string.voice_dictation_muted)
    }
    val cancelDescription =
        stringResource(R.string.voice_dictation_cancel_content_description)
    val startOverDescription =
        stringResource(R.string.voice_dictation_start_over_content_description)
    val doneDescription =
        stringResource(R.string.voice_dictation_done_content_description)
    val settingsDescription =
        stringResource(R.string.voice_dictation_permission_settings_content_description)
    val grantDescription =
        stringResource(R.string.voice_dictation_permission_grant_content_description)
    val rootInteraction = remember { MutableInteractionSource() }

    Dialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
        ),
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surface)
                .clickable(
                    interactionSource = rootInteraction,
                    indication = null,
                    onClick = {},
                )
                .testTag("voice_dictation_overlay"),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp, vertical = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = stringResource(R.string.voice_dictation_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = listeningLabel,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("voice_dictation_listening_label"),
                )

                Spacer(modifier = Modifier.height(24.dp))

                Text(
                    text = state.transcript.ifBlank {
                        stringResource(R.string.voice_dictation_transcript_placeholder)
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    color = if (state.transcript.isBlank()) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .testTag("voice_dictation_transcript"),
                )

                state.error?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .padding(vertical = 8.dp)
                            .testTag("voice_dictation_error"),
                    )
                }

                if (state.permissionRequired) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(bottom = 16.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.voice_dictation_permission_body),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.testTag("voice_dictation_permission_body"),
                        )
                        Button(
                            onClick = onRequestPermission,
                            modifier = Modifier
                                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                .testTag("voice_dictation_permission_grant")
                                .semantics {
                                    contentDescription = grantDescription
                                },
                        ) {
                            Text(text = stringResource(R.string.voice_dictation_permission_grant))
                        }
                        TextButton(
                            onClick = onOpenPermissionSettings,
                            modifier = Modifier
                                .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                                .testTag("voice_dictation_permission_settings")
                                .semantics {
                                    contentDescription = settingsDescription
                                },
                        ) {
                            Text(text = stringResource(R.string.voice_dictation_permission_settings))
                        }
                    }
                } else {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .padding(vertical = 16.dp)
                            .size(112.dp)
                            .scale(micScale)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primaryContainer)
                            .clickable(onClick = onToggleListening)
                            .testTag("voice_dictation_mic_toggle")
                            .semantics {
                                contentDescription = micContentDescription
                            },
                    ) {
                        Icon(
                            imageVector = if (state.isListening) {
                                Icons.Filled.Mic
                            } else {
                                Icons.Filled.MicOff
                            },
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.size(48.dp),
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(
                        onClick = onCancel,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("voice_dictation_cancel")
                            .semantics {
                                contentDescription = cancelDescription
                            },
                    ) {
                        Text(text = stringResource(R.string.voice_dictation_cancel))
                    }
                    TextButton(
                        onClick = onStartOver,
                        enabled = !state.permissionRequired,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("voice_dictation_start_over")
                            .semantics {
                                contentDescription = startOverDescription
                            },
                    ) {
                        Text(text = stringResource(R.string.voice_dictation_start_over))
                    }
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .testTag("voice_dictation_done")
                            .semantics {
                                contentDescription = doneDescription
                            },
                    ) {
                        Text(text = stringResource(R.string.voice_dictation_done))
                    }
                }
            }
        }
    }
}
