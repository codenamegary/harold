
package harold.android.chat

import kotlinx.serialization.json.JsonElement

data class StreamExtension(
    val requestId: String,
    val method: String,
    val params: JsonElement,
)
