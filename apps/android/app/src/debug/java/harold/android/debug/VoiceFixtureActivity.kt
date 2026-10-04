package harold.android.debug

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.core.content.ContextCompat
import harold.android.chat.HandlerVoiceDictationRestartScheduler
import harold.android.chat.VoiceDictationController
import harold.android.chat.VoiceDictationOverlay
import harold.android.chat.VoiceDictationUiState
import harold.android.chat.VoskSpeechRecognitionClient
import harold.android.ui.theme.HaroldTheme

/**
 * Debug-only fixture host for emulator screenshots of Vosk voice input.
 * Launch: adb shell am start -n harold.android/.debug.VoiceFixtureActivity
 * Scripted voice, no microphone needed: add --ez scripted_voice true
 */
class VoiceFixtureActivity : ComponentActivity() {
    private lateinit var controller: VoiceDictationController
    private var uiState by mutableStateOf(VoiceDictationUiState())

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            uiState = controller.onRecordAudioPermissionResult(granted)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val application = applicationContext as Application
        val scriptedVoice = intent.getBooleanExtra(EXTRA_SCRIPTED_VOICE, false)

        controller = VoiceDictationController(
            speechClient = if (scriptedVoice) {
                ScriptedSpeechRecognitionClient(SILENCE_LOOP_SCRIPT)
            } else {
                VoskSpeechRecognitionClient(application)
            },
            silenceScheduler = HandlerVoiceDictationRestartScheduler(),
            restartScheduler = HandlerVoiceDictationRestartScheduler(),
        )
        controller.onStateChanged = { next -> uiState = next }

        val hasPermission = scriptedVoice || ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

        controller.open(
            baseline = "",
            hasRecordAudioPermission = hasPermission,
            composerEnabled = true,
        )
        // The fixture screenshots the full-screen presentation.
        uiState = controller.expand()

        setContent {
            HaroldTheme(dynamicColor = false) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background)
                        .testTag("voice_fixture_root"),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "Voice fixture",
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    VoiceDictationOverlay(
                        state = uiState,
                        commandPrefix = "",
                        commands = emptyList(),
                        commandListVisible = false,
                        onToggleListening = { uiState = controller.toggleListening() },
                        onStartOver = { uiState = controller.startOver() },
                        onCancel = {
                            uiState = controller.cancel()
                            finish()
                        },
                        onCollapse = {
                            uiState = controller.cancel()
                            finish()
                        },
                        onKeyboard = {
                            controller.finish()
                            finish()
                        },
                        onSend = {
                            controller.finish()
                            finish()
                        },
                        onCommandToggle = {},
                        onCommandPick = {},
                        onCommandDismiss = {},
                        onRequestPermission = {
                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        },
                        onOpenPermissionSettings = {},
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        controller.destroy()
        super.onDestroy()
    }

    private companion object {
        const val EXTRA_SCRIPTED_VOICE = "scripted_voice"

        /**
         * Speak, fall silent, let the ring appear, speak again to cancel it, then fall silent for
         * good and let the countdown mute the mic. Timings assume a 3 s grace and a 5 s ring, so
         * the ring first shows at ~4.9 s, gets cancelled at ~6.9 s, and mutes at ~15.6 s.
         */
        val SILENCE_LOOP_SCRIPT = listOf(
            ScriptedSpeech.Partial(atMs = 500, text = "hello"),
            ScriptedSpeech.Partial(atMs = 900, text = "hello from"),
            ScriptedSpeech.Partial(atMs = 1_400, text = "hello from the scripted mic"),
            ScriptedSpeech.Final(atMs = 1_900, text = "hello from the scripted mic"),
            ScriptedSpeech.Partial(atMs = 6_900, text = "still here"),
            ScriptedSpeech.Final(atMs = 7_600, text = "still here"),
        )
    }
}
