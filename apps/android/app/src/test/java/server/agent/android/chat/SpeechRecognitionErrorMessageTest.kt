package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechRecognitionErrorMessageTest {
    @Test
    fun modelUnavailableUsesClearMessage() {
        assertEquals(
            "Speech model failed to load. Voice input is unavailable.",
            speechRecognitionErrorMessage(SpeechRecognitionErrors.MODEL_UNAVAILABLE),
        )
    }

    @Test
    fun busyUsesRetryMessage() {
        assertEquals(
            "Speech recognition is busy. Try again.",
            speechRecognitionErrorMessage(SpeechRecognitionErrors.BUSY),
        )
    }

    @Test
    fun unknownFallsBack() {
        assertEquals(
            "Speech recognition failed.",
            speechRecognitionErrorMessage(999),
        )
    }
}
