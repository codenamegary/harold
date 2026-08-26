package server.agent.android.debug

import android.os.Handler
import android.os.Looper
import server.agent.android.chat.SpeechRecognitionCallbacks
import server.agent.android.chat.SpeechRecognitionClient

/** One scripted recognizer event, fired [atMs] after the session starts. */
sealed interface ScriptedSpeech {
    val atMs: Long

    /** A live guess while the speaker is still talking. */
    data class Partial(
        override val atMs: Long,
        val text: String,
        val rmsDb: Float = 6f,
    ) : ScriptedSpeech

    /** An utterance endpoint. The real recognizer keeps running after one of these. */
    data class Final(
        override val atMs: Long,
        val text: String,
    ) : ScriptedSpeech
}

/**
 * Debug-only speech client that replays a fixed script on the real clock. Lets the whole silence
 * mute loop run end to end, controller and timers and UI included, on a device with no usable
 * microphone. The script restarts on every session, so unmuting replays it.
 */
class ScriptedSpeechRecognitionClient(
    private val script: List<ScriptedSpeech>,
    private val handler: Handler = Handler(Looper.getMainLooper()),
) : SpeechRecognitionClient {
    private val pending = mutableListOf<Runnable>()

    override fun isAvailable(): Boolean = true

    override fun startListening(callbacks: SpeechRecognitionCallbacks) {
        cancelScript()
        callbacks.onReadyForSpeech()
        callbacks.onBeginningOfSpeech()
        script.forEach { step ->
            post(step.atMs) {
                when (step) {
                    is ScriptedSpeech.Partial -> {
                        callbacks.onRmsChanged(step.rmsDb)
                        callbacks.onPartialResult(step.text)
                    }

                    is ScriptedSpeech.Final -> callbacks.onFinalResult(step.text)
                }
            }
        }
    }

    override fun stopListening() = cancelScript()

    override fun destroy() = cancelScript()

    private fun post(delayMs: Long, action: () -> Unit) {
        val runnable = Runnable(action)
        pending += runnable
        handler.postDelayed(runnable, delayMs)
    }

    private fun cancelScript() {
        pending.forEach(handler::removeCallbacks)
        pending.clear()
    }
}
