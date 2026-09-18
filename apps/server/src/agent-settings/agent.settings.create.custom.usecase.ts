import { AgentSettings } from "contracts/http/agent-settings"
import { serializeSpawnSnapshot } from "./agent-registry"
import { serializeArgs } from "./agent.settings.args"
import { resolveDisplayName } from "./agent.settings.view"
import {
  allocateCustomAgentId,
  allocateCustomDisplayName,
} from "./custom.agent.id"
import { buildCustomSpawnSnapshot } from "./agent.settings.custom.snapshot"
import { AgentSettingsResult } from "./agent.settings.errors"
import {
  BuildAgentSettingsView,
  FindAgentSettingsRow,
  InsertAgentSettingsRow,
  ListAgentSettingsRows,
} from "./agent.settings.ports"

export type CreateCustomAgent = () => AgentSettingsResult<AgentSettings>

export type CreateCustomAgentDeps = Readonly<{
  listRows: ListAgentSettingsRows
  findRow: FindAgentSettingsRow
  insertRow: InsertAgentSettingsRow
  buildView: BuildAgentSettingsView
}>

const nowIso = () => new Date().toISOString()

export const makeCreateCustomAgent =
  (deps: CreateCustomAgentDeps): CreateCustomAgent =>
  () => {
    const rows = deps.listRows()
    const existingIds = new Set(rows.map((row) => row.agentId))
    const existingNames = new Set(
      rows.map((row) => resolveDisplayName(row.agentId, row)),
    )

    const displayName = allocateCustomDisplayName(existingNames)
    const agentId = allocateCustomAgentId(displayName, existingIds)
    const spawnSnapshot = buildCustomSpawnSnapshot(agentId, displayName, null, [])
    const updatedAt = nowIso()

    deps.insertRow({
      agentId,
      enabled: false,
      path: null,
      args: serializeArgs([]),
      spawnSnapshot: serializeSpawnSnapshot(spawnSnapshot),
      updatedAt,
    })

    const row = deps.findRow(agentId)

    return { ok: true, value: deps.buildView(agentId, row) }
  }
