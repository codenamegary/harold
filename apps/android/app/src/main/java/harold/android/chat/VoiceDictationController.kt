package harold.android.chat

/** How the active dictation session is presented in the chat UI. */
enum class VoiceDictationPresentation {
    /** Replaces the composer's text slot; the conversation stays visible. */
    Inline,

    /** Full-screen overlay with the large transcript view. */
    Expanded,
}

data class VoiceDictationUiState(
    val visible: Boolean = false,
    val presentation: VoiceDictationPresentation = VoiceDictationPresentation.Inline,
    val transcript: String = "",
    val isListening: Boolean = false,
    val audioLevel: Float = 0f,
    val permissionRequired: Boolean = false,
    val error: String? = null,
    val recognizerAvailable: Boolean = true,
    /** True while the mute countdown ring shows. False during the silent grace period. */
    val silenceCountdownActive: Boolean = false,
    /** How long the ring takes to drain. Always the same timer the controller mutes on. */
    val silenceCountdownDurationMs: Long = VoiceDictationController.SILENCE_COUNTDOWN_MS,
)

class VoiceDictationController(
    private val speechClient: SpeechRecognitionClient,
    private val silenceScheduler: VoiceDictationRestartScheduler,
    private val restartScheduler: VoiceDictationRestartScheduler,
) {
    private var transcript = VoiceDictationTranscript("")
    private var hasRecordAudioPermission = false
    private var listening = false
    private var sessionGeneration = 0
    private var busyRestartAttempts = 0
    private var heardSpeechInSession = false

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
                // Without mic permission the permission explainer needs the
                // full-screen surface, so the session opens expanded.
                presentation = if (hasRecordAudioPermission) {
                    VoiceDictationPresentation.Inline
                } else {
                    VoiceDictationPresentation.Expanded
                },
                transcript = transcript.displayText,
                isListening = false,
                audioLevel = 0f,
                permissionRequired = !hasRecordAudioPermission,
                error = null,
                recognizerAvailable = speechClient.isAvailable(),
                silenceCountdownActive = false,
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
                    silenceCountdownActive = false,
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
                silenceCountdownActive = false,
                error = null,
            ),
        )
    }

    fun expand(): VoiceDictationUiState {
        if (!state.visible) {
            return state
        }
        return publish(state.copy(presentation = VoiceDictationPresentation.Expanded))
    }

    fun collapse(): VoiceDictationUiState {
        if (!state.visible) {
            return state
        }
        return publish(state.copy(presentation = VoiceDictationPresentation.Inline))
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
        silenceScheduler.cancel()
        speechClient.destroy()

        val generation = ++sessionGeneration
        listening = true
        heardSpeechInSession = false
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
                    heardSpeechInSession = true
                    silenceScheduler.cancel()
                    transcript = transcript.withPartial(text)
                    publish(
                        state.copy(
                            transcript = transcript.displayText,
                            silenceCountdownActive = false,
                            error = null,
                        ),
                    )
                }

                override fun onFinalResult(text: String) {
                    if (!isCurrent() || !listening) {
                        return
                    }

                    if (text.isNotBlank()) {
                        heardSpeechInSession = true
                        transcript = transcript.withFinalSegment(text)
                    } else if (heardSpeechInSession) {
                        transcript = transcript.commitPartialAsFinal()
                    }

                    publish(
                        state.copy(
                            transcript = transcript.displayText,
                            error = null,
                        ),
                    )

                    if (heardSpeechInSession) {
                        armSilenceGrace()
                    }
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
                silenceCountdownActive = false,
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

    private fun armSilenceGrace() {
        silenceScheduler.cancel()
        publish(state.copy(silenceCountdownActive = false))
        silenceScheduler.schedule(SILENCE_GRACE_MS) {
            if (!listening || !state.visible) {
                return@schedule
            }
            publish(
                state.copy(
                    silenceCountdownActive = true,
                    silenceCountdownDurationMs = SILENCE_COUNTDOWN_MS,
                ),
            )
            silenceScheduler.schedule(SILENCE_COUNTDOWN_MS) {
                if (!listening || !state.visible) {
                    return@schedule
                }
                muteListening()
            }
        }
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
        silenceScheduler.cancel()
        listening = false
        heardSpeechInSession = false
        sessionGeneration += 1
        speechClient.destroy()
        publish(
            state.copy(
                transcript = transcript.displayText,
                isListening = false,
                audioLevel = 0f,
                silenceCountdownActive = false,
                error = error,
            ),
        )
    }

    private fun invalidateSession() {
        restartScheduler.cancel()
        silenceScheduler.cancel()
        listening = false
        heardSpeechInSession = false
        busyRestartAttempts = 0
        sessionGeneration += 1
        speechClient.destroy()
    }

    private fun publish(next: VoiceDictationUiState): VoiceDictationUiState {
        state = next
        onStateChanged?.invoke(next)
        return next
    }

    companion object {
        const val SILENCE_GRACE_MS = 3000L
        const val SILENCE_COUNTDOWN_MS = 5000L
        const val BUSY_RESTART_DELAY_MS = 150L
        const val MAX_BUSY_RESTART_ATTEMPTS = 3
    }
}

private fun normalizeRms(rmsDb: Float): Float {
    val clamped = rmsDb.coerceIn(0f, 10f)
    return clamped / 10f
}
