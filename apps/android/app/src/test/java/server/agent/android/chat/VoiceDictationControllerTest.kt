package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceDictationControllerTest {
    @Test
    fun permissionDeniedBlocksRecognition() {
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient)

        val state = controller.open(
            baseline = "Draft",
            hasRecordAudioPermission = false,
            composerEnabled = true,
        )

        assertTrue(state.visible)
        assertTrue(state.permissionRequired)
        assertFalse(state.isListening)
        assertEquals(0, speechClient.startCount)
    }

    @Test
    fun grantedPermissionStartsListening() {
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient)

        controller.open(
            baseline = "",
            hasRecordAudioPermission = true,
            composerEnabled = true,
        )

        assertEquals(1, speechClient.startCount)
        assertTrue(controller.state.isListening)
    }

    @Test
    fun muteUnmuteCyclesAppendTranscript() {
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient)
        controller.open(
            baseline = "Can you fix",
            hasRecordAudioPermission = true,
            composerEnabled = true,
        )

        speechClient.emitPartial("the login")
        assertEquals("Can you fix the login", controller.state.transcript)

        controller.toggleListening()
        assertEquals("Can you fix the login", controller.state.transcript)
        assertFalse(controller.state.isListening)

        controller.toggleListening()
        speechClient.emitPartial("on Android")
        speechClient.emitFinal("on Android")

        assertEquals("Can you fix the login on Android", controller.state.transcript)
    }

    @Test
    fun startOverRestoresBaselineSnapshot() {
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient)
        controller.open(
            baseline = "Can you fix",
            hasRecordAudioPermission = true,
            composerEnabled = true,
        )

        speechClient.emitFinal("the login bug")
        controller.startOver()

        assertEquals("Can you fix", controller.state.transcript)
        assertFalse(controller.state.isListening)
    }

    @Test
    fun finishReturnsTranscriptAndClosesOverlay() {
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient)
        controller.open(
            baseline = "Hello",
            hasRecordAudioPermission = true,
            composerEnabled = true,
        )
        speechClient.emitFinal("world")

        val (state, transcript) = controller.finish()

        assertFalse(state.visible)
        assertEquals("Hello world", transcript)
    }

    @Test
    fun doesNotOpenWhenComposerDisabled() {
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient)

        val state = controller.open(
            baseline = "Draft",
            hasRecordAudioPermission = true,
            composerEnabled = false,
        )

        assertFalse(state.visible)
        assertEquals(0, speechClient.startCount)
    }
}

class FakeSpeechRecognitionClient : SpeechRecognitionClient {
    var startCount = 0
        private set

    private var callbacks: SpeechRecognitionCallbacks? = null
    private var available = true
    private var pendingPartial: String = ""

    override fun isAvailable(): Boolean = available

    fun setAvailable(value: Boolean) {
        available = value
    }

    override fun startListening(callbacks: SpeechRecognitionCallbacks) {
        startCount += 1
        this.callbacks = callbacks
        pendingPartial = ""
        callbacks.onReadyForSpeech()
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
