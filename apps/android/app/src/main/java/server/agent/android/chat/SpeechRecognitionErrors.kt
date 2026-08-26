package server.agent.android.chat

object SpeechRecognitionErrors {
    const val AUDIO = 1
    const val CLIENT = 2
    const val INSUFFICIENT_PERMISSIONS = 3
    const val NO_MATCH = 4
    const val BUSY = 5
    const val SPEECH_TIMEOUT = 6
    const val MODEL_UNAVAILABLE = 7
}

fun speechRecognitionErrorMessage(errorCode: Int): String =
    when (errorCode) {
        SpeechRecognitionErrors.AUDIO -> "Microphone audio failed."
        SpeechRecognitionErrors.CLIENT -> "Speech recognition stopped."
        SpeechRecognitionErrors.INSUFFICIENT_PERMISSIONS ->
            "Microphone permission is required."
        SpeechRecognitionErrors.NO_MATCH -> "No speech detected."
        SpeechRecognitionErrors.BUSY -> "Speech recognition is busy. Try again."
        SpeechRecognitionErrors.SPEECH_TIMEOUT -> "No speech detected."
        SpeechRecognitionErrors.MODEL_UNAVAILABLE ->
            "Speech model failed to load. Voice input is unavailable."
        else -> "Speech recognition failed."
    }

