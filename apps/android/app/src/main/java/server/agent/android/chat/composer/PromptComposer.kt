package server.agent.android.chat.composer

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.OpenInFull
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import server.agent.android.R
import server.agent.android.chat.VoiceDictationUiState
import server.agent.android.ui.components.AgentButtonVariant
import server.agent.android.ui.components.AgentIconButton
import server.agent.android.ui.components.AudioPill
import server.agent.android.ui.promptinput.PromptInput

private val MIN_TOUCH_TARGET = 48.dp

/**
 * The chat input card: a full-width text or voice slot on top and an
 * icon-only action rail below. Voice replaces the text slot in place, so
 * text and voice act as two peer input modes the user can switch between.
 */
@Composable
fun PromptComposer(
    composerState: TextFieldState,
    composerEnabled: Boolean,
    showCancel: Boolean,
    cancelSubmitting: Boolean,
    voice: VoiceDictationUiState,
    voiceMicEnabled: Boolean,
    micContentDescription: String,
    voiceMessage: String,
    voiceCommandPrefix: String,
    voiceCommandListVisible: Boolean,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
    onMicClick: () -> Unit,
    onSlashClick: () -> Unit,
    onVoiceKeyboard: () -> Unit,
    onVoiceExpand: () -> Unit,
    onVoiceToggleListening: () -> Unit,
    onVoiceCommandToggle: () -> Unit,
    onVoiceSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val inVoiceMode = voice.visible

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
    ) {
        Column(
            modifier = Modifier
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .animateContentSize(),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (inVoiceMode) {
                VoiceSlot(
                    voiceMessage = voiceMessage,
                    voiceCommandPrefix = voiceCommandPrefix,
                )
                voice.error?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.testTag("voice_inline_error"),
                    )
                }
                VoiceActionRail(
                    voice = voice,
                    composerEnabled = composerEnabled,
                    sendEnabled = composerEnabled && voiceMessage.isNotBlank(),
                    commandListVisible = voiceCommandListVisible,
                    onKeyboard = onVoiceKeyboard,
                    onExpand = onVoiceExpand,
                    onToggleListening = onVoiceToggleListening,
                    onCommandToggle = onVoiceCommandToggle,
                    onSend = onVoiceSubmit,
                )
            } else {
                TextSlot(
                    composerState = composerState,
                    composerEnabled = composerEnabled,
                )
                TextActionRail(
                    composerEnabled = composerEnabled,
                    sendEnabled = composerEnabled && composerState.text.isNotBlank(),
                    showCancel = showCancel,
                    cancelSubmitting = cancelSubmitting,
                    voiceMicEnabled = voiceMicEnabled,
                    micContentDescription = micContentDescription,
                    onSlashClick = onSlashClick,
                    onCancel = onCancel,
                    onMicClick = onMicClick,
                    onSubmit = onSubmit,
                )
            }
        }
    }
}

@Composable
private fun TextSlot(
    composerState: TextFieldState,
    composerEnabled: Boolean,
) {
    val commandStyle = commandSpanStyle(MaterialTheme.colorScheme.primary)
    val plugins = remember(commandStyle) { chatPromptPlugins(commandStyle) }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = MIN_TOUCH_TARGET)
            .padding(horizontal = 4.dp, vertical = 8.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        PromptInput(
            state = composerState,
            plugins = plugins,
            enabled = composerEnabled,
            placeholder = stringResource(R.string.composer_placeholder),
            modifier = Modifier.testTag("chat_composer"),
        )
    }
}

@Composable
private fun VoiceSlot(
    voiceMessage: String,
    voiceCommandPrefix: String,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = MIN_TOUCH_TARGET)
            .padding(horizontal = 4.dp, vertical = 8.dp)
            .testTag("voice_inline_slot"),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (voiceMessage.isBlank()) {
            Text(
                text = stringResource(R.string.voice_dictation_transcript_placeholder),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.testTag("voice_inline_placeholder"),
            )
        } else {
            Text(
                text = buildAnnotatedString {
                    if (voiceCommandPrefix.isNotEmpty()) {
                        withStyle(
                            SpanStyle(
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                            ),
                        ) {
                            append(voiceCommandPrefix)
                        }
                        append(voiceMessage.removePrefix(voiceCommandPrefix))
                    } else {
                        append(voiceMessage)
                    }
                },
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 4,
                modifier = Modifier.testTag("voice_inline_transcript"),
            )
        }
    }
}

@Composable
private fun TextActionRail(
    composerEnabled: Boolean,
    sendEnabled: Boolean,
    showCancel: Boolean,
    cancelSubmitting: Boolean,
    voiceMicEnabled: Boolean,
    micContentDescription: String,
    onSlashClick: () -> Unit,
    onCancel: () -> Unit,
    onMicClick: () -> Unit,
    onSubmit: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        SlashButton(
            enabled = composerEnabled,
            onClick = onSlashClick,
            testTag = "chat_command_button",
        )

        Spacer(modifier = Modifier.weight(1f))

        if (showCancel) {
            AgentIconButton(
                onClick = onCancel,
                enabled = !cancelSubmitting,
                contentDescription = stringResource(R.string.chat_cancel_content_description),
                modifier = Modifier.testTag("chat_cancel_button"),
                icon = {
                    Icon(
                        imageVector = Icons.Filled.Stop,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                    )
                },
            )
        }

        AgentIconButton(
            onClick = onMicClick,
            enabled = voiceMicEnabled,
            contentDescription = micContentDescription,
            modifier = Modifier.testTag("chat_voice_mic_button"),
            icon = {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = null,
                )
            },
        )

        AgentIconButton(
            onClick = onSubmit,
            enabled = sendEnabled,
            variant = AgentButtonVariant.Primary,
            contentDescription = stringResource(R.string.chat_send_content_description),
            modifier = Modifier.testTag("chat_send_button"),
            icon = {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = null,
                )
            },
        )
    }
}

@Composable
private fun VoiceActionRail(
    voice: VoiceDictationUiState,
    composerEnabled: Boolean,
    sendEnabled: Boolean,
    commandListVisible: Boolean,
    onKeyboard: () -> Unit,
    onExpand: () -> Unit,
    onToggleListening: () -> Unit,
    onCommandToggle: () -> Unit,
    onSend: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        AgentIconButton(
            onClick = onKeyboard,
            contentDescription = stringResource(R.string.voice_keyboard_content_description),
            modifier = Modifier.testTag("voice_keyboard_button"),
            icon = {
                Icon(
                    imageVector = Icons.Filled.Keyboard,
                    contentDescription = null,
                )
            },
        )

        AgentIconButton(
            onClick = onExpand,
            contentDescription = stringResource(R.string.voice_expand_content_description),
            modifier = Modifier.testTag("voice_expand_button"),
            icon = {
                Icon(
                    imageVector = Icons.Filled.OpenInFull,
                    contentDescription = null,
                )
            },
        )

        SlashButton(
            enabled = composerEnabled,
            onClick = onCommandToggle,
            testTag = "voice_command_button",
            active = commandListVisible,
        )

        Spacer(modifier = Modifier.weight(1f))

        AudioPill(
            isListening = voice.isListening,
            audioLevel = voice.audioLevel,
            onClick = onToggleListening,
            enabled = !voice.permissionRequired,
            silenceCountdownDurationMs = if (voice.silenceCountdownActive) {
                voice.silenceCountdownDurationMs
            } else {
                null
            },
            contentDescription = stringResource(
                if (voice.isListening) {
                    R.string.voice_dictation_mute_content_description
                } else {
                    R.string.voice_dictation_unmute_content_description
                },
            ),
        )

        AgentIconButton(
            onClick = onSend,
            enabled = sendEnabled,
            variant = AgentButtonVariant.Primary,
            contentDescription = stringResource(R.string.chat_send_content_description),
            modifier = Modifier.testTag("voice_send_button"),
            icon = {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = null,
                )
            },
        )
    }
}

/** The command-menu trigger: a slash glyph, since Material has no slash icon. */
@Composable
fun SlashButton(
    enabled: Boolean,
    onClick: () -> Unit,
    testTag: String,
    modifier: Modifier = Modifier,
    active: Boolean = false,
) {
    AgentIconButton(
        onClick = onClick,
        enabled = enabled,
        variant = if (active) AgentButtonVariant.Frosted else AgentButtonVariant.Ghost,
        contentDescription = stringResource(R.string.chat_command_button_content_description),
        modifier = modifier
            .defaultMinSize(minWidth = MIN_TOUCH_TARGET, minHeight = MIN_TOUCH_TARGET)
            .testTag(testTag),
        icon = {
            Text(
                text = "/",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                ),
                color = if (enabled) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                },
            )
        },
    )
}
