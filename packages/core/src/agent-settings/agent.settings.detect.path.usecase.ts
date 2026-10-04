import { resolveAgentPath, WhichFn } from "./resolve-agent-path"
import { ValidateExecutablePathFn } from "./validate-agent-path"
import { isCatalogAgentId, parseSpawnSnapshot, resolveTemplateBinaryName } from "./agent-registry"
import { AgentSettingsResult } from "./agent.settings.errors"
import { FindAgentSettingsRow } from "./agent.settings.ports"

export type DetectAgentPath = (agentId: string) => AgentSettingsResult<{ path: string }>

export type DetectAgentPathDeps = Readonly<{
  findRow: FindAgentSettingsRow
  whichFn: WhichFn
  validatePath: ValidateExecutablePathFn
}>

export const detectPathForAgent = (
  agentId: string,
  whichFn: WhichFn,
  spawnSnapshot: ReturnType<typeof parseSpawnSnapshot>,
): string | null => {
  const binaryName = resolveTemplateBinaryName(agentId, spawnSnapshot)
  if (binaryName === null) {
    return null
  }
  return resolveAgentPath(binaryName, whichFn)
}

export const makeDetectAgentPath =
  (deps: DetectAgentPathDeps): DetectAgentPath =>
  (agentId) => {
    const row = deps.findRow(agentId)

    const spawnSnapshot = parseSpawnSnapshot(row?.spawnSnapshot ?? null)
    if (!isCatalogAgentId(agentId) && spawnSnapshot === null && row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    if (!isCatalogAgentId(agentId) && row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    const detectedPath = detectPathForAgent(agentId, deps.whichFn, spawnSnapshot)
    if (!detectedPath || !deps.validatePath(detectedPath)) {
      return { ok: false, error: { kind: "path_not_found" } }
    }

    return { ok: true, value: { path: detectedPath } }
  }
