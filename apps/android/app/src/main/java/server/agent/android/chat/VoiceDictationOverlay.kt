package server.agent.android.chat

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import server.agent.android.R
import server.agent.android.ui.components.AgentButton
import server.agent.android.ui.components.AgentButtonSize
import server.agent.android.ui.components.AgentButtonVariant
import server.agent.android.ui.components.AgentChip
import server.agent.android.ui.components.AudioPill
import server.agent.android.ui.components.fadingEdge

private val MIN_TOUCH_TARGET = 48.dp

/**
 * Full-screen modern voice dictation modal with live auto-scrolling transcript,
 * top gradient fade mask, reactive audio pill visualizer, and adaptive secondary controls.
 */
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

    BackHandler(onBack = onCancel)

    val micContentDescription = if (state.isListening) {
        stringResource(R.string.voice_dictation_mute_content_description)
    } else {
        stringResource(R.string.voice_dictation_unmute_content_description)
    }
    val cancelDescription = stringResource(R.string.voice_dictation_cancel_content_description)
    val startOverDescription = stringResource(R.string.voice_dictation_start_over_content_description)
    val doneDescription = stringResource(R.string.voice_dictation_done_content_description)
    val settingsDescription = stringResource(R.string.voice_dictation_permission_settings_content_description)
    val grantDescription = stringResource(R.string.voice_dictation_permission_grant_content_description)

    val scrollState = rememberScrollState()

    // Auto-scroll to the newest dictated words
    LaunchedEffect(state.transcript) {
        if (state.transcript.isNotBlank()) {
            scrollState.animateScrollTo(scrollState.maxValue)
        }
    }

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
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 20.dp)
                .testTag("voice_dictation_overlay"),
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // Main Transcript Area
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .fadingEdge(top = 48.dp, bottom = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (state.transcript.isBlank()) {
                        Text(
                            text = stringResource(R.string.voice_dictation_transcript_placeholder),
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            textAlign = TextAlign.Center,
                            modifier = Modifier
                                .padding(horizontal = 16.dp)
                                .testTag("voice_dictation_placeholder"),
                        )
                    } else {
                        Text(
                            text = state.transcript,
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            textAlign = TextAlign.Start,
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(scrollState)
                                .padding(top = 32.dp, bottom = 24.dp)
                                .testTag("voice_dictation_transcript"),
                        )
                    }
                }

                // Error message banner if any
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

                Spacer(modifier = Modifier.height(12.dp))

                // Bottom Controls Section
                if (state.permissionRequired) {
                    // Microphone permission required flow
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 12.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.voice_dictation_permission_body),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.testTag("voice_dictation_permission_body"),
                        )

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AgentButton(
                                onClick = onCancel,
                                variant = AgentButtonVariant.Ghost,
                                size = AgentButtonSize.Medium,
                                modifier = Modifier
                                    .testTag("voice_dictation_cancel")
                                    .semantics {
                                        contentDescription = cancelDescription
                                    },
                            ) {
                                Text(text = stringResource(R.string.voice_dictation_cancel))
                            }

                            AgentButton(
                                onClick = onRequestPermission,
                                variant = AgentButtonVariant.Primary,
                                size = AgentButtonSize.Medium,
                                modifier = Modifier
                                    .testTag("voice_dictation_permission_grant")
                                    .semantics {
                                        contentDescription = grantDescription
                                    },
                            ) {
                                Text(text = stringResource(R.string.voice_dictation_permission_grant))
                            }
                        }

                        AgentButton(
                            onClick = onOpenPermissionSettings,
                            variant = AgentButtonVariant.Ghost,
                            size = AgentButtonSize.Small,
                            modifier = Modifier
                                .testTag("voice_dictation_permission_settings")
                                .semantics {
                                    contentDescription = settingsDescription
                                },
                        ) {
                            Text(text = stringResource(R.string.voice_dictation_permission_settings))
                        }
                    }
                } else {
                    // Standard dictation controls
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        // Paused secondary actions (Start over & Cancel), hidden while actively listening
                        AnimatedVisibility(
                            visible = !state.isListening,
                            enter = fadeIn() + slideInVertically { it / 2 },
                            exit = fadeOut() + slideOutVertically { it / 2 },
                        ) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(bottom = 4.dp),
                            ) {
                                AgentChip(
                                    onClick = onStartOver,
                                    label = stringResource(R.string.voice_dictation_start_over),
                                    variant = AgentButtonVariant.Frosted,
                                    size = AgentButtonSize.Small,
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Filled.Refresh,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp),
                                        )
                                    },
                                    modifier = Modifier
                                        .testTag("voice_dictation_start_over")
                                        .semantics {
                                            contentDescription = startOverDescription
                                        },
                                )

                                AgentChip(
                                    onClick = onCancel,
                                    label = stringResource(R.string.voice_dictation_cancel),
                                    variant = AgentButtonVariant.Frosted,
                                    size = AgentButtonSize.Small,
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Filled.Close,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp),
                                        )
                                    },
                                    modifier = Modifier
                                        .testTag("voice_dictation_cancel")
                                        .semantics {
                                            contentDescription = cancelDescription
                                        },
                                )
                            }
                        }

                        // Bottom Action Bar: AudioPill & Done Button
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AudioPill(
                                isListening = state.isListening,
                                audioLevel = state.audioLevel,
                                silenceCountdownDurationMs = state.silenceCountdownDurationMs
                                    .takeIf { state.silenceCountdownActive },
                                onClick = onToggleListening,
                                contentDescription = micContentDescription,
                                modifier = Modifier
                                    .weight(1f, fill = false)
                                    .testTag("voice_dictation_mic_toggle"),
                            )

                            AgentButton(
                                onClick = onConfirm,
                                variant = AgentButtonVariant.Primary,
                                size = AgentButtonSize.Medium,
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Filled.Check,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                },
                                modifier = Modifier
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
    }
}
