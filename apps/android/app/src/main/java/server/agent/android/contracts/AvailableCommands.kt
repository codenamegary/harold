package server.agent.android.contracts

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * A slash command an agent exposes for the current session. Mirror of the
 * server's AvailableCommandSchema in apps/server/src/session/hub/commands.available.ts.
 */
data class AvailableCommand(
    val name: String,
    val description: String,
    /** Argument hint from the wire's `input.hint`, e.g. "query". */
    val hint: String? = null,
)

/**
 * Parses a session_update payload as an ACP available_commands_update.
 * Returns null when the update is a different kind or the shape is invalid,
 * matching the server's safeParse behavior.
 */
fun parseAvailableCommands(update: kotlinx.serialization.json.JsonElement): List<AvailableCommand>? {
    val obj = update as? JsonObject ?: return null
    val kind = (obj["sessionUpdate"] as? JsonPrimitive)?.contentOrNull ?: return null
    if (kind != "available_commands_update") {
        return null
    }
    val items = obj["availableCommands"] as? JsonArray ?: return null

    val commands = ArrayList<AvailableCommand>(items.size)
    for (item in items) {
        val command = item as? JsonObject ?: return null
        val name = (command["name"] as? JsonPrimitive)?.contentOrNull ?: return null
        if (name.isEmpty()) {
            return null
        }
        val description = (command["description"] as? JsonPrimitive)?.contentOrNull ?: return null
        val hint = ((command["input"] as? JsonObject)?.get("hint") as? JsonPrimitive)?.contentOrNull
        commands.add(AvailableCommand(name = name, description = description, hint = hint))
    }
    return commands
}
