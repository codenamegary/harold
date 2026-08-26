package server.agent.android.chat

import android.app.Application
import android.os.Handler
import android.os.Looper
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.IOException

class VoskSpeechRecognitionClient(
    application: Application,
    private val modelStore: VoskModelStore = VoskModelStore(application),
    private val mainHandler: Handler = Handler(Looper.getMainLooper()),
) : SpeechRecognitionClient {
    private var speechService: SpeechService? = null
    private var sessionGeneration = 0
    private var deliveredFinalForSession = false

    init {
        modelStore.ensureLoaded { }
    }

    override fun isAvailable(): Boolean =
        !modelStore.hasFailed()

    override fun startListening(callbacks: SpeechRecognitionCallbacks) {
        destroyServiceOnly()
        val generation = sessionGeneration
        deliveredFinalForSession = false

        modelStore.ensureLoaded { result ->
            mainHandler.post {
                if (generation != sessionGeneration) {
                    return@post
                }

                result.fold(
                    onSuccess = { model ->
                        beginListening(generation, model, callbacks)
                    },
                    onFailure = {
                        callbacks.onError(SpeechRecognitionErrors.MODEL_UNAVAILABLE)
                    },
                )
            }
        }
    }

    override fun stopListening() {
        speechService?.stop()
    }

    override fun destroy() {
        sessionGeneration += 1
        deliveredFinalForSession = false
        destroyServiceOnly()
    }

    private fun beginListening(
        generation: Int,
        model: Model,
        callbacks: SpeechRecognitionCallbacks,
    ) {
        if (generation != sessionGeneration) {
            return
        }

        try {
            val recognizer = Recognizer(model, SAMPLE_RATE)
            val service = SpeechService(recognizer, SAMPLE_RATE)
            speechService = service
            callbacks.onReadyForSpeech()
            service.startListening(
                object : RecognitionListener {
                    override fun onPartialResult(hypothesis: String?) {
                        if (generation != sessionGeneration || deliveredFinalForSession) {
                            return
                        }
                        val text = VoskHypothesisParser.partialText(hypothesis.orEmpty())
                        if (text.isNotEmpty()) {
                            callbacks.onPartialResult(text)
                        }
                    }

                    override fun onResult(hypothesis: String?) {
                        deliverFinal(generation, hypothesis.orEmpty(), callbacks)
                    }

                    override fun onFinalResult(hypothesis: String?) {
                        deliverFinal(generation, hypothesis.orEmpty(), callbacks)
                    }

                    override fun onError(exception: Exception?) {
                        if (generation != sessionGeneration || deliveredFinalForSession) {
                            return
                        }
                        callbacks.onError(mapException(exception))
                    }

                    override fun onTimeout() {
                        if (generation != sessionGeneration || deliveredFinalForSession) {
                            return
                        }
                        callbacks.onError(SpeechRecognitionErrors.SPEECH_TIMEOUT)
                    }
                },
            )
        } catch (error: IOException) {
            callbacks.onError(SpeechRecognitionErrors.AUDIO)
        } catch (error: RuntimeException) {
            callbacks.onError(SpeechRecognitionErrors.CLIENT)
        }
    }

    private fun deliverFinal(
        generation: Int,
        hypothesis: String,
        callbacks: SpeechRecognitionCallbacks,
    ) {
        if (generation != sessionGeneration || deliveredFinalForSession) {
            return
        }

        deliveredFinalForSession = true
        val text = VoskHypothesisParser.finalText(hypothesis)
        callbacks.onFinalResult(text)
        destroyServiceOnly()
    }

    private fun destroyServiceOnly() {
        speechService?.stop()
        speechService?.shutdown()
        speechService = null
    }

    private fun mapException(exception: Exception?): Int =
        when (exception) {
            is IOException -> SpeechRecognitionErrors.AUDIO
            is SecurityException -> SpeechRecognitionErrors.INSUFFICIENT_PERMISSIONS
            else -> SpeechRecognitionErrors.CLIENT
        }

    private companion object {
        const val SAMPLE_RATE = 16_000.0f
    }
}
