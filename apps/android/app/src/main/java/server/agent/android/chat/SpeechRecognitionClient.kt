package server.agent.android.chat

import android.app.Application
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

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

class AndroidSpeechRecognitionClient(
    private val application: Application,
) : SpeechRecognitionClient {
    private var recognizer: SpeechRecognizer? = null
    private var callbacks: SpeechRecognitionCallbacks? = null

    override fun isAvailable(): Boolean =
        SpeechRecognizer.isRecognitionAvailable(application)

    override fun startListening(callbacks: SpeechRecognitionCallbacks) {
        destroy()
        this.callbacks = callbacks

        val speechRecognizer = SpeechRecognizer.createSpeechRecognizer(application)
        recognizer = speechRecognizer
        speechRecognizer.setRecognitionListener(createListener())

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
            )
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        speechRecognizer.startListening(intent)
    }

    override fun stopListening() {
        recognizer?.stopListening()
    }

    override fun destroy() {
        recognizer?.destroy()
        recognizer = null
        callbacks = null
    }

    private fun createListener(): RecognitionListener =
        object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                callbacks?.onReadyForSpeech()
            }

            override fun onBeginningOfSpeech() {
                callbacks?.onBeginningOfSpeech()
            }

            override fun onRmsChanged(rmsDb: Float) {
                callbacks?.onRmsChanged(rmsDb)
            }

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() = Unit

            override fun onError(error: Int) {
                callbacks?.onError(error)
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                callbacks?.onFinalResult(text)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                callbacks?.onPartialResult(text)
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        }
}

fun speechRecognitionErrorMessage(errorCode: Int): String =
    when (errorCode) {
        SpeechRecognizer.ERROR_AUDIO -> "Microphone audio failed."
        SpeechRecognizer.ERROR_CLIENT -> "Speech recognition stopped."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is required."
        SpeechRecognizer.ERROR_NETWORK -> "Speech recognition needs a network connection."
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition timed out."
        SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognition is busy. Try again."
        SpeechRecognizer.ERROR_SERVER -> "Speech recognition service failed."
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected."
        else -> "Speech recognition failed."
    }
