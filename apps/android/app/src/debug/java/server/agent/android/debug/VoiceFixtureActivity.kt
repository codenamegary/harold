package server.agent.android.debug

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
import server.agent.android.chat.HandlerVoiceDictationRestartScheduler
import server.agent.android.chat.VoiceDictationController
import server.agent.android.chat.VoiceDictationOverlay
import server.agent.android.chat.VoiceDictationUiState
import server.agent.android.chat.VoskSpeechRecognitionClient
import server.agent.android.ui.theme.AgentServerTheme

/**
 * Debug-only fixture host for emulator screenshots of Vosk voice input.
 * Launch: adb shell am start -n server.agent.android/.debug.VoiceFixtureActivity
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
        controller = VoiceDictationController(
            speechClient = VoskSpeechRecognitionClient(application),
            restartScheduler = HandlerVoiceDictationRestartScheduler(),
        )
        controller.onStateChanged = { next -> uiState = next }

        val hasPermission = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED

        uiState = controller.open(
            baseline = "",
            hasRecordAudioPermission = hasPermission,
            composerEnabled = true,
        )

        setContent {
            AgentServerTheme(dynamicColor = false) {
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
                        onToggleListening = { uiState = controller.toggleListening() },
                        onStartOver = { uiState = controller.startOver() },
                        onCancel = {
                            uiState = controller.cancel()
                            finish()
                        },
                        onConfirm = {
                            controller.finish()
                            finish()
                        },
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
}
