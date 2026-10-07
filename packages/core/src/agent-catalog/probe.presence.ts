import { AgentId } from "contracts/http/agent-settings"
import { PresenceProbeContext, PresenceProbeResult } from "./catalog.ports"
import { CatalogSpawn, catalogAgentsById } from "./generated/catalog.agents.generated"
import { productAgentOverridesById } from "./overrides/product.overrides"

const isNpxOrUvxName = (binaryName: string): boolean => binaryName === "npx" || binaryName === "uvx"

const defaultPresenceFromSpawn = (
  spawn: CatalogSpawn,
  binaryNameOverride: string | undefined,
  ctx: PresenceProbeContext,
): PresenceProbeResult => {
  const binaryName = binaryNameOverride ?? (spawn.kind === "binary" ? spawn.binaryName : null)

  if (binaryName === null || isNpxOrUvxName(binaryName)) {
    return { present: false, path: null }
  }

  if (spawn.kind !== "binary" && binaryNameOverride === undefined) {
    return { present: false, path: null }
  }

  const path = ctx.which(binaryName) ?? null
  return { present: path !== null, path }
}

/**
 * Single presence seam for callers. Never treats npx/uvx as present evidence.
 */
export const probePresence = (
  agentId: AgentId,
  ctx: PresenceProbeContext,
  spawn?: CatalogSpawn,
): PresenceProbeResult => {
  const override = productAgentOverridesById[agentId]
  if (override?.presenceProbe !== undefined) {
    return override.presenceProbe(ctx)
  }

  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
  const resolvedSpawn = spawn ?? catalogAgent?.spawn
  if (resolvedSpawn === undefined) {
    return { present: false, path: null }
  }

  return defaultPresenceFromSpawn(resolvedSpawn, override?.binaryName, ctx)
}
