package server.agent.android.chat

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
    private val restartScheduler: VoiceDictationRestartScheduler =
        ImmediateVoiceDictationRestartScheduler(),
) {
    private var transcript = VoiceDictationTranscript("")
    private var hasRecordAudioPermission = false
    private var listening = false
    private var sessionGeneration = 0
    private var busyRestartAttempts = 0

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
                        speechRecognitionErrorMessage(SpeechRecognitionErrors.MODEL_UNAVAILABLE)
                    } else {
                        null
                    },
                ),
            )
        }

        this.hasRecordAudioPermission = hasRecordAudioPermission
        transcript = VoiceDictationTranscript(baseline)
        invalidateSession()

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
            invalidateSession()
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
        invalidateSession()

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
        invalidateSession()
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
        invalidateSession()
    }

    private fun startListening(fromBusyRetry: Boolean = false): VoiceDictationUiState {
        if (!state.visible || !hasRecordAudioPermission) {
            return state
        }

        restartScheduler.cancel()
        speechClient.destroy()

        val generation = ++sessionGeneration
        listening = true
        if (!fromBusyRetry) {
            busyRestartAttempts = 0
        }

        speechClient.startListening(
            object : SpeechRecognitionCallbacks {
                private fun isCurrent(): Boolean =
                    generation == sessionGeneration && state.visible

                override fun onReadyForSpeech() = Unit

                override fun onBeginningOfSpeech() = Unit

                override fun onRmsChanged(rmsDb: Float) {
                    if (!isCurrent() || !listening) {
                        return
                    }
                    publish(
                        state.copy(
                            audioLevel = normalizeRms(rmsDb),
                        ),
                    )
                }

                override fun onPartialResult(text: String) {
                    if (!isCurrent() || !listening) {
                        return
                    }
                    transcript = transcript.withPartial(text)
                    publish(
                        state.copy(
                            transcript = transcript.displayText,
                            error = null,
                        ),
                    )
                }

                override fun onFinalResult(text: String) {
                    if (!isCurrent()) {
                        return
                    }
                    transcript = transcript.withFinalSegment(text)
                    endListening(error = null)
                }

                override fun onError(errorCode: Int) {
                    if (!isCurrent()) {
                        return
                    }

                    if (errorCode == SpeechRecognitionErrors.BUSY && listening) {
                        scheduleBusyRestart(generation)
                        return
                    }

                    val ignorable = errorCode == SpeechRecognitionErrors.NO_MATCH ||
                        errorCode == SpeechRecognitionErrors.SPEECH_TIMEOUT

                    endListening(
                        error = if (ignorable) null else speechRecognitionErrorMessage(errorCode),
                    )
                }
            },
        )

        if (!listening || generation != sessionGeneration) {
            return state
        }

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

        transcript = transcript.commitPartialAsFinal()
        endListening(error = null)
        return state
    }

    private fun scheduleBusyRestart(generation: Int) {
        if (generation != sessionGeneration || !listening) {
            return
        }

        speechClient.destroy()

        if (busyRestartAttempts >= MAX_BUSY_RESTART_ATTEMPTS) {
            endListening(error = speechRecognitionErrorMessage(SpeechRecognitionErrors.BUSY))
            return
        }

        busyRestartAttempts += 1
        restartScheduler.schedule(BUSY_RESTART_DELAY_MS) {
            if (generation != sessionGeneration || !state.visible || !listening) {
                return@schedule
            }
            startListening(fromBusyRetry = true)
        }
    }

    private fun endListening(error: String?) {
        restartScheduler.cancel()
        listening = false
        sessionGeneration += 1
        speechClient.destroy()
        publish(
            state.copy(
                transcript = transcript.displayText,
                isListening = false,
                audioLevel = 0f,
                error = error,
            ),
        )
    }

    private fun invalidateSession() {
        restartScheduler.cancel()
        listening = false
        busyRestartAttempts = 0
        sessionGeneration += 1
        speechClient.destroy()
    }

    private fun publish(next: VoiceDictationUiState): VoiceDictationUiState {
        state = next
        onStateChanged?.invoke(next)
        return next
    }

    private companion object {
        const val BUSY_RESTART_DELAY_MS = 150L
        const val MAX_BUSY_RESTART_ATTEMPTS = 3
    }
}

private fun normalizeRms(rmsDb: Float): Float {
    val clamped = rmsDb.coerceIn(0f, 10f)
    return clamped / 10f
}
