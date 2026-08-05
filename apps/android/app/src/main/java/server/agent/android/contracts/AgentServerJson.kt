package server.agent.android.contracts

import kotlinx.serialization.json.Json

/**
 * Boundary decoder for every agent-server payload. Strict on purpose: the server
 * validates with `z.strictObject`, so an unknown key or enum value on this side
 * means the client and server contracts have drifted.
 */
val AgentServerJson: Json = Json {
    ignoreUnknownKeys = false
    isLenient = false
    coerceInputValues = false
    classDiscriminator = "type"
}
