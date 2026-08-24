package server.agent.android.chat

import android.speech.SpeechRecognizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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

    @Test
    fun lateErrorFromEndedSessionDoesNotMuteRestartedListening() {
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient)
        controller.open(
            baseline = "",
            hasRecordAudioPermission = true,
            composerEnabled = true,
        )

        val endedSession = speechClient.requireCallbacks()
        speechClient.emitFinal("hello")
        assertFalse(controller.state.isListening)
        assertEquals("hello", controller.state.transcript)

        controller.toggleListening()
        assertTrue(controller.state.isListening)
        assertEquals(2, speechClient.startCount)

        endedSession.onError(SpeechRecognizer.ERROR_CLIENT)

        assertTrue(controller.state.isListening)
        assertNull(controller.state.error)
        assertEquals("hello", controller.state.transcript)
    }

    @Test
    fun lateFinalFromEndedSessionDoesNotDuplicateAfterUnmute() {
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient)
        controller.open(
            baseline = "",
            hasRecordAudioPermission = true,
            composerEnabled = true,
        )

        val endedSession = speechClient.requireCallbacks()
        speechClient.emitFinal("first")
        controller.toggleListening()
        speechClient.emitPartial("second")

        endedSession.onFinalResult("first again")

        assertEquals("first second", controller.state.transcript)
        assertTrue(controller.state.isListening)
    }

    @Test
    fun recognizerBusyOnUnmuteRetriesAndRecovers() {
        val scheduler = ManualVoiceDictationRestartScheduler()
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient, scheduler)
        controller.open(
            baseline = "",
            hasRecordAudioPermission = true,
            composerEnabled = true,
        )
        speechClient.emitFinal("draft")

        speechClient.busyOnStart = true
        controller.toggleListening()

        assertTrue(controller.state.isListening)
        assertNull(controller.state.error)
        assertTrue(scheduler.hasPending())
        assertEquals(150L, scheduler.lastDelayMs)
        assertEquals(2, speechClient.startCount)

        speechClient.busyOnStart = false
        scheduler.runPending()

        assertTrue(controller.state.isListening)
        assertNull(controller.state.error)
        assertEquals(3, speechClient.startCount)
        assertFalse(scheduler.hasPending())
    }

    @Test
    fun recognizerBusyExhaustsRetriesAndSurfacesError() {
        val scheduler = ManualVoiceDictationRestartScheduler()
        val speechClient = FakeSpeechRecognitionClient()
        val controller = VoiceDictationController(speechClient, scheduler)
        controller.open(
            baseline = "",
            hasRecordAudioPermission = true,
            composerEnabled = true,
        )
        speechClient.emitFinal("draft")

        speechClient.busyOnStart = true
        controller.toggleListening()

        repeat(3) {
            assertTrue(scheduler.hasPending())
            scheduler.runPending()
        }

        assertFalse(controller.state.isListening)
        assertEquals(
            speechRecognitionErrorMessage(SpeechRecognizer.ERROR_RECOGNIZER_BUSY),
            controller.state.error,
        )
        assertFalse(scheduler.hasPending())
    }
}

class FakeSpeechRecognitionClient : SpeechRecognitionClient {
    var startCount = 0
        private set

    var busyOnStart: Boolean = false

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
        if (busyOnStart) {
            callbacks.onError(SpeechRecognizer.ERROR_RECOGNIZER_BUSY)
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
