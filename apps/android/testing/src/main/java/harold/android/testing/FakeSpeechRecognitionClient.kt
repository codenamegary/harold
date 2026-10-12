package harold.android.testing

import harold.android.voice.SpeechRecognitionCallbacks
import harold.android.voice.SpeechRecognitionClient
import harold.android.voice.SpeechRecognitionErrors

class FakeSpeechRecognitionClient : SpeechRecognitionClient {
    var startCount = 0
        private set

    var busyOnStart: Boolean = false
    var errorOnStart: Int? = null

    private var callbacks: SpeechRecognitionCallbacks? = null
    private var available = true
    private var pendingPartial: String = ""

    override fun isAvailable(): Boolean = available

    fun setAvailable(value: Boolean) {
        available = value
    }

    fun requireCallbacks(): SpeechRecognitionCallbacks =
        checkNotNull(callbacks) { "No active speech callbacks" }

    override fun startListening(callbacks: SpeechRecognitionCallbacks) {
        startCount += 1
        this.callbacks = callbacks
        pendingPartial = ""
        callbacks.onReadyForSpeech()
        when {
            busyOnStart -> callbacks.onError(SpeechRecognitionErrors.BUSY)
            errorOnStart != null -> callbacks.onError(checkNotNull(errorOnStart))
        }
    }

    override fun stopListening() {
        if (pendingPartial.isNotEmpty()) {
            callbacks?.onFinalResult(pendingPartial)
            pendingPartial = ""
        }
    }

    override fun destroy() {
        callbacks = null
        pendingPartial = ""
    }

    fun emitPartial(text: String) {
        pendingPartial = text
        callbacks?.onPartialResult(text)
    }

    fun emitFinal(text: String) {
        pendingPartial = ""
        callbacks?.onFinalResult(text)
    }
}
