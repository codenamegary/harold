package harold.android.stream

import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.elementDescriptors
import kotlinx.serialization.descriptors.elementNames
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import harold.android.contracts.SessionStreamJson
import harold.android.contracts.SessionStreamServerMessage

sealed interface FrameOutcome {
    data class Decoded(
        val message: SessionStreamServerMessage,
    ) : FrameOutcome

    data class UnknownFrame(
        val type: String,
    ) : FrameOutcome

    data class MalformedFrame(
        val detail: String,
    ) : FrameOutcome
}

class ServerFrameDecoder(
    private val json: Json = SessionStreamJson,
) {
    var unknownFrameCount: Int = 0
        private set

    fun decode(text: String): FrameOutcome {
        val root = runCatching { json.parseToJsonElement(text) }
            .getOrElse { error ->
                return FrameOutcome.MalformedFrame(error.message ?: "invalid JSON")
            }
        if (root !is JsonObject) {
            return FrameOutcome.MalformedFrame("frame root is not a JSON object")
        }

        val type = root["type"]
            ?.let { element -> element as? JsonPrimitive }
            ?.takeIf { primitive -> primitive.isString }
            ?.content
            ?: return FrameOutcome.MalformedFrame("frame type is missing or not a string")

        if (type !in knownTypes) {
            unknownFrameCount += 1
            return FrameOutcome.UnknownFrame(type)
        }

        return try {
            FrameOutcome.Decoded(
                json.decodeFromString(SessionStreamServerMessage.serializer(), text),
            )
        } catch (error: SerializationException) {
            FrameOutcome.MalformedFrame(error.message ?: "malformed $type frame")
        }
    }

    private companion object {
        val knownTypes: Set<String> =
            SessionStreamServerMessage.serializer().descriptor.elementDescriptors
                .flatMap { descriptor -> descriptor.elementNames }
                .toSet()
    }
}
