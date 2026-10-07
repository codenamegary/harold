package harold.android.pairing

import java.net.URI
import java.net.URLDecoder

data class PairingPayload(
    val endpoint: String,
    val code: String,
)

class PairingPayloadParseException(
    message: String,
) : Exception(message)

interface PairingPayloadParser {
    fun parse(payload: String): PairingPayload
}

class DefaultPairingPayloadParser(
    private val rejectCleartext: Boolean,
) : PairingPayloadParser {
    override fun parse(payload: String): PairingPayload {
        val trimmed = payload.trim()

        if (trimmed.startsWith("{")) {
            throw PairingPayloadParseException("Legacy JSON pairing payload is not supported")
        }

        val uri = runCatching { URI(trimmed) }
            .getOrNull()
            ?: throw PairingPayloadParseException("Invalid pairing URI")

        if (uri.scheme == LEGACY_SCHEME) {
            throw PairingPayloadParseException("Legacy agent-server pairing payload is not supported; app update required")
        }

        if (uri.scheme != SCHEME) {
            throw PairingPayloadParseException("Invalid pairing URI scheme")
        }

        if (uri.host != HOST) {
            throw PairingPayloadParseException("Invalid pairing URI host")
        }

        if (!uri.path.isNullOrEmpty() && uri.path != "/") {
            throw PairingPayloadParseException("Invalid pairing URI path")
        }

        val params = parseQuery(uri.rawQuery)

        val versionValues = params["v"].orEmpty()

        if (versionValues.isEmpty()) {
            throw PairingPayloadParseException("Missing version parameter")
        }

        if (versionValues.size > 1) {
            throw PairingPayloadParseException("Duplicate v parameter")
        }

        if (versionValues.first() != VERSION) {
            throw PairingPayloadParseException("Unsupported pairing URI version")
        }

        val endpointValues = params["endpoint"].orEmpty()

        if (endpointValues.isEmpty()) {
            throw PairingPayloadParseException("Missing endpoint parameter")
        }

        if (endpointValues.size > 1) {
            throw PairingPayloadParseException("Duplicate endpoint parameter")
        }

        val endpoint = endpointValues.first()

        if (!isAbsoluteUrl(endpoint)) {
            throw PairingPayloadParseException("Invalid endpoint parameter")
        }

        if (rejectCleartext && endpoint.startsWith("http://")) {
            throw PairingPayloadParseException("Cleartext endpoint is not allowed")
        }

        val codeValues = params["code"].orEmpty()

        if (codeValues.isEmpty()) {
            throw PairingPayloadParseException("Missing code parameter")
        }

        if (codeValues.size > 1) {
            throw PairingPayloadParseException("Duplicate code parameter")
        }

        val code = codeValues.first().uppercase()

        if (!CODE_PATTERN.matches(code)) {
            throw PairingPayloadParseException("Invalid code parameter")
        }

        return PairingPayload(endpoint = endpoint, code = code)
    }

    private fun parseQuery(rawQuery: String?): Map<String, List<String>> {
        if (rawQuery.isNullOrBlank()) {
            return emptyMap()
        }

        return rawQuery
            .split("&")
            .mapNotNull { pair ->
                if (pair.isBlank()) {
                    return@mapNotNull null
                }

                val separatorIndex = pair.indexOf('=')

                if (separatorIndex <= 0) {
                    return@mapNotNull null
                }

                val key = decodeComponent(pair.substring(0, separatorIndex))
                val value = decodeComponent(pair.substring(separatorIndex + 1))
                key to value
            }
            .groupBy({ it.first }, { it.second })
    }

    private fun decodeComponent(value: String): String =
        URLDecoder.decode(value, "UTF-8")

    private fun isAbsoluteUrl(value: String): Boolean =
        value.startsWith("http://") || value.startsWith("https://")

    companion object {
        const val SCHEME = "harold"
        const val HOST = "pair"
        const val LEGACY_SCHEME = "agent-server"
        const val VERSION = "1"
        private val CODE_PATTERN = Regex("^[A-Z0-9]{3}-[A-Z0-9]{3}$")
    }
}
