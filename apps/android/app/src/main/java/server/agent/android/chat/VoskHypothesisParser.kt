package server.agent.android.chat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

object VoskHypothesisParser {
    private val json = Json { ignoreUnknownKeys = true }

    fun partialText(hypothesis: String): String =
        readField(hypothesis, "partial")

    fun finalText(hypothesis: String): String =
        readField(hypothesis, "text")

    private fun readField(hypothesis: String, field: String): String {
        if (hypothesis.isBlank()) {
            return ""
        }

        return runCatching {
            json.parseToJsonElement(hypothesis)
                .jsonObject[field]
                ?.jsonPrimitive
                ?.contentOrNull
                .orEmpty()
        }.getOrDefault("")
    }
}
