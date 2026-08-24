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
    private var sessionGeneration = 0

    override fun isAvailable(): Boolean =
        SpeechRecognizer.isRecognitionAvailable(application)

    override fun startListening(callbacks: SpeechRecognitionCallbacks) {
        destroy()
        val generation = sessionGeneration

        val speechRecognizer = SpeechRecognizer.createSpeechRecognizer(application)
        recognizer = speechRecognizer
        speechRecognizer.setRecognitionListener(createListener(generation, callbacks))

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
        sessionGeneration += 1
        recognizer?.destroy()
        recognizer = null
    }

    private fun createListener(
        generation: Int,
        sessionCallbacks: SpeechRecognitionCallbacks,
    ): RecognitionListener =
        object : RecognitionListener {
            private fun dispatch(block: SpeechRecognitionCallbacks.() -> Unit) {
                if (generation == sessionGeneration) {
                    sessionCallbacks.block()
                }
            }

            override fun onReadyForSpeech(params: Bundle?) {
                dispatch { onReadyForSpeech() }
            }

            override fun onBeginningOfSpeech() {
                dispatch { onBeginningOfSpeech() }
            }

            override fun onRmsChanged(rmsDb: Float) {
                dispatch { onRmsChanged(rmsDb) }
            }

            override fun onBufferReceived(buffer: ByteArray?) = Unit

            override fun onEndOfSpeech() = Unit

            override fun onError(error: Int) {
                dispatch { onError(error) }
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                dispatch { onFinalResult(text) }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                dispatch { onPartialResult(text) }
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
