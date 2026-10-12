package harold.android.contracts

import kotlinx.serialization.json.Json

/**
 * Boundary decoder for every harold payload. Strict on purpose: the server
 * validates with `z.strictObject`, so an unknown key or enum value on this side
 * means the client and server contracts have drifted.
 */
val HaroldJson: Json = Json {
    ignoreUnknownKeys = false
    isLenient = false
    coerceInputValues = false
    classDiscriminator = "type"
}

/**
 * Boundary decoder for Session Stream frames. The host ships frame types and
 * extra fields independently of an installed build, so unknown keys inside a
 * known frame are ignored. Required fields stay strict: a missing or invalid
 * field is a malformed frame, not drift to shrug off.
 */
val SessionStreamJson: Json = Json(from = HaroldJson) {
    ignoreUnknownKeys = true
}
