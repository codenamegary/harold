package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test

class VoiceDictationTranscriptTest {
    @Test
    fun accumulatesSpeechAcrossMuteUnmuteCycles() {
        var transcript = VoiceDictationTranscript(baseline = "Can you fix")

        transcript = transcript.withPartial("the login")
        assertEquals("Can you fix the login", transcript.displayText)

        transcript = transcript.withFinalSegment("the login bug")
        assertEquals("Can you fix the login bug", transcript.displayText)

        transcript = transcript.withPartial("on Android")
        assertEquals("Can you fix the login bug on Android", transcript.displayText)

        transcript = transcript.withFinalSegment("on Android")
        assertEquals("Can you fix the login bug on Android", transcript.displayText)
    }

    @Test
    fun commitPartialAsFinalLocksInCurrentPartial() {
        val transcript = VoiceDictationTranscript(baseline = "Can you fix")
            .withPartial("the login")
            .commitPartialAsFinal()

        assertEquals("Can you fix the login", transcript.displayText)

        val afterNewPartial = transcript.withPartial("on Android")
        assertEquals("Can you fix the login on Android", afterNewPartial.displayText)
    }

    @Test
    fun startOverRestoresOpenTimeSnapshot() {
        var transcript = VoiceDictationTranscript(baseline = "Can you fix")
            .withFinalSegment("the login bug")
            .withPartial("on Android")

        transcript = transcript.resetSpeech()

        assertEquals("Can you fix", transcript.displayText)
    }

    @Test
    fun ignoresEmptyFinalSegments() {
        val transcript = VoiceDictationTranscript(baseline = "Hello")
            .withPartial("world")
            .withFinalSegment("   ")

        assertEquals("Hello", transcript.displayText)
    }
}
