import { AgentSpawnSnapshot } from "contracts/http/agent-settings"
import { parseSpawnSnapshot } from "./agent-registry"
import { FindAgentSettingsRow } from "./agent.settings.ports"

export type GetSpawnSnapshot = (agentId: string) => AgentSpawnSnapshot | null

export type GetSpawnSnapshotDeps = Readonly<{
  findRow: FindAgentSettingsRow
}>

export const makeGetSpawnSnapshot =
  (deps: GetSpawnSnapshotDeps): GetSpawnSnapshot =>
  (agentId) =>
    parseSpawnSnapshot(deps.findRow(agentId)?.spawnSnapshot ?? null)
