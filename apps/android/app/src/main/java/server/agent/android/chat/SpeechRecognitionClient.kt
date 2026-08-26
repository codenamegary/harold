package server.agent.android.chat

interface SpeechRecognitionCallbacks {
    fun onReadyForSpeech()

    fun onBeginningOfSpeech()

    fun onRmsChanged(rmsDb: Float)

    fun onPartialResult(text: String)

    fun onFinalResult(text: String)

    fun onError(errorCode: Int)
}

interface SpeechRecognitionClient {
    fun isAvailable(): Boolean

    fun startListening(callbacks: SpeechRecognitionCallbacks)

    fun stopListening()

    fun destroy()
}
