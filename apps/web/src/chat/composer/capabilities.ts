import { AgentCapabilityInventory } from "contracts/http/agent-settings"

export const PROMPT_IMAGE_CAPABILITY = "promptCapabilities.image"
export const PROMPT_EMBEDDED_CONTEXT_CAPABILITY = "promptCapabilities.embeddedContext"

/**
 * A capability counts as advertised only when the agent declared it true.
 * Known paths are always present in the inventory with advertised: false when
 * the agent omitted them, and declared-false entries must not enable UI.
 */
export const advertisesCapability = (
  inventory: AgentCapabilityInventory | null | undefined,
  path: string,
): boolean => {
  const entry = inventory?.entries.find((candidate) => candidate.path === path)
  return entry !== undefined && entry.advertised === true && entry.value === true
}

export const supportsImageAttachments = (
  inventory: AgentCapabilityInventory | null | undefined,
): boolean => advertisesCapability(inventory, PROMPT_IMAGE_CAPABILITY)

export const supportsFileAttachments = (
  inventory: AgentCapabilityInventory | null | undefined,
): boolean => advertisesCapability(inventory, PROMPT_EMBEDDED_CONTEXT_CAPABILITY)
