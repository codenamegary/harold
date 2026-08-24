package server.agent.android.chat

internal fun joinSpeechParts(vararg parts: String): String =
    parts
        .map { part -> part.trim() }
        .filter { part -> part.isNotEmpty() }
        .joinToString(" ")

data class VoiceDictationTranscript(
    val baseline: String,
    private val committedSpeech: String = "",
    private val partialSpeech: String = "",
) {
    val displayText: String
        get() = joinSpeechParts(baseline, committedSpeech, partialSpeech)

    fun withPartial(partial: String): VoiceDictationTranscript =
        copy(partialSpeech = partial.trim())

    fun withFinalSegment(final: String): VoiceDictationTranscript {
        val trimmed = final.trim()
        if (trimmed.isEmpty()) {
            return copy(partialSpeech = "")
        }

        return copy(
            committedSpeech = joinSpeechParts(committedSpeech, trimmed),
            partialSpeech = "",
        )
    }

    /** Commits the current partial into committed speech without waiting on the recognizer. */
    fun commitPartialAsFinal(): VoiceDictationTranscript {
        if (partialSpeech.isEmpty()) {
            return this
        }
        return withFinalSegment(partialSpeech)
    }

    fun resetSpeech(): VoiceDictationTranscript =
        copy(
            committedSpeech = "",
            partialSpeech = "",
        )
}
