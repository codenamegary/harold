package server.agent.android.chat.composer

import kotlinx.serialization.json.JsonPrimitive
import server.agent.android.contracts.AgentCapabilityInventory
import server.agent.android.contracts.AttachmentKind

const val PROMPT_IMAGE_CAPABILITY = "promptCapabilities.image"
const val PROMPT_EMBEDDED_CONTEXT_CAPABILITY = "promptCapabilities.embeddedContext"

/**
 * A capability counts as advertised only when the agent declared it true.
 * Known paths are always present in the inventory with advertised false when
 * the agent omitted them, and declared-false entries must not enable UI.
 */
fun advertisesCapability(
    inventory: AgentCapabilityInventory?,
    path: String,
): Boolean =
    inventory?.entries
        ?.find { entry -> entry.path == path }
        ?.let { entry ->
            val primitive = entry.value as? JsonPrimitive
            entry.advertised && primitive?.content == "true"
        }
        ?: false

fun supportsImageAttachments(inventory: AgentCapabilityInventory?): Boolean =
    advertisesCapability(inventory, PROMPT_IMAGE_CAPABILITY)

fun supportsFileAttachments(inventory: AgentCapabilityInventory?): Boolean =
    advertisesCapability(inventory, PROMPT_EMBEDDED_CONTEXT_CAPABILITY)

fun capabilityFor(kind: AttachmentKind): String =
    if (kind == AttachmentKind.Image) PROMPT_IMAGE_CAPABILITY else PROMPT_EMBEDDED_CONTEXT_CAPABILITY
