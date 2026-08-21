package server.agent.android.chat

import android.speech.SpeechRecognizer

data class VoiceDictationUiState(
    val visible: Boolean = false,
    val transcript: String = "",
    val isListening: Boolean = false,
    val audioLevel: Float = 0f,
    val permissionRequired: Boolean = false,
    val error: String? = null,
    val recognizerAvailable: Boolean = true,
)

class VoiceDictationController(
    private val speechClient: SpeechRecognitionClient,
) {
    private var transcript = VoiceDictationTranscript("")
    private var hasRecordAudioPermission = false
    private var listening = false

    var onStateChanged: ((VoiceDictationUiState) -> Unit)? = null

    var state: VoiceDictationUiState = VoiceDictationUiState(
        recognizerAvailable = speechClient.isAvailable(),
    )
        private set

    fun canOpen(composerEnabled: Boolean): Boolean =
        composerEnabled && speechClient.isAvailable()

    fun open(
        baseline: String,
        hasRecordAudioPermission: Boolean,
        composerEnabled: Boolean,
    ): VoiceDictationUiState {
        if (!canOpen(composerEnabled)) {
            return publish(
                state.copy(
                    visible = false,
                    error = if (!speechClient.isAvailable()) {
                        "Speech recognition is not available on this device."
                    } else {
                        null
                    },
                ),
            )
        }

        this.hasRecordAudioPermission = hasRecordAudioPermission
        transcript = VoiceDictationTranscript(baseline)
        listening = false

        return publish(
            VoiceDictationUiState(
                visible = true,
                transcript = transcript.displayText,
                isListening = false,
                audioLevel = 0f,
                permissionRequired = !hasRecordAudioPermission,
                error = null,
                recognizerAvailable = speechClient.isAvailable(),
            ),
        ).also {
            if (hasRecordAudioPermission) {
                startListening()
            }
        }
    }

    fun onRecordAudioPermissionResult(granted: Boolean): VoiceDictationUiState {
        hasRecordAudioPermission = granted
        if (!state.visible) {
            return state
        }

        if (!granted) {
            listening = false
            speechClient.stopListening()
            speechClient.destroy()
            return publish(
                state.copy(
                    isListening = false,
                    audioLevel = 0f,
                    permissionRequired = true,
                    error = "Microphone permission is required for voice input.",
                ),
            )
        }

        return publish(
            state.copy(
                permissionRequired = false,
                error = null,
            ),
        ).also {
            startListening()
        }
    }

    fun toggleListening(): VoiceDictationUiState {
        if (!state.visible || state.permissionRequired || !hasRecordAudioPermission) {
            return state
        }

        return if (listening) {
            muteListening()
        } else {
            startListening()
        }
    }

    fun startOver(): VoiceDictationUiState {
        if (!state.visible) {
            return state
        }

        transcript = transcript.resetSpeech()
        if (listening) {
            speechClient.stopListening()
            speechClient.destroy()
            listening = false
        }

        return publish(
            state.copy(
                transcript = transcript.displayText,
                isListening = false,
                audioLevel = 0f,
                error = null,
            ),
        )
    }

    fun cancel(): VoiceDictationUiState {
        stopRecognition()
        transcript = VoiceDictationTranscript("")
        return publish(VoiceDictationUiState(recognizerAvailable = speechClient.isAvailable()))
    }

    fun finish(): Pair<VoiceDictationUiState, String?> {
        if (!state.visible) {
            return state to null
        }

        val result = transcript.displayText
        cancel()
        return state to result
    }

    fun destroy() {
        onStateChanged = null
        stopRecognition()
    }

    private fun startListening(): VoiceDictationUiState {
        if (!state.visible || !hasRecordAudioPermission) {
            return state
        }

        listening = true
        speechClient.startListening(
            object : SpeechRecognitionCallbacks {
                override fun onReadyForSpeech() = Unit

                override fun onBeginningOfSpeech() = Unit

                override fun onRmsChanged(rmsDb: Float) {
                    publish(
                        state.copy(
                            audioLevel = normalizeRms(rmsDb),
                        ),
                    )
                }

                override fun onPartialResult(text: String) {
                    transcript = transcript.withPartial(text)
                    publish(
                        state.copy(
                            transcript = transcript.displayText,
                            error = null,
                        ),
                    )
                }

                override fun onFinalResult(text: String) {
                    transcript = transcript.withFinalSegment(text)
                    publish(
                        state.copy(
                            transcript = transcript.displayText,
                            isListening = false,
                            audioLevel = 0f,
                        ),
                    )
                    listening = false
                }

                override fun onError(errorCode: Int) {
                    val ignorable = errorCode == SpeechRecognizer.ERROR_NO_MATCH ||
                        errorCode == SpeechRecognizer.ERROR_SPEECH_TIMEOUT

                    listening = false
                    publish(
                        state.copy(
                            isListening = false,
                            audioLevel = 0f,
                            error = if (ignorable) null else speechRecognitionErrorMessage(errorCode),
                        ),
                    )
                }
            },
        )

        return publish(
            state.copy(
                isListening = true,
                error = null,
            ),
        )
    }

    private fun muteListening(): VoiceDictationUiState {
        if (!listening) {
            return state
        }

        speechClient.stopListening()
        listening = false
        return publish(
            state.copy(
                isListening = false,
                audioLevel = 0f,
            ),
        )
    }

    private fun stopRecognition() {
        listening = false
        speechClient.stopListening()
        speechClient.destroy()
    }

    private fun publish(next: VoiceDictationUiState): VoiceDictationUiState {
        state = next
        onStateChanged?.invoke(next)
        return next
    }
}

private fun normalizeRms(rmsDb: Float): Float {
    val clamped = rmsDb.coerceIn(0f, 10f)
    return clamped / 10f
}
