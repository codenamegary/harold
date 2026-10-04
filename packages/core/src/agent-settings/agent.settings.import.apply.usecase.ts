import { AgentSettings, ImportApplyBody } from "contracts/http/agent-settings"
import { isCatalogAgentId, serializeSpawnSnapshot } from "./agent-registry"
import { serializeArgs } from "./agent.settings.args"
import { AgentSettingsResult } from "./agent.settings.errors"
import {
  FindAgentSettingsRow,
  InsertAgentSettingsRow,
  UpdateAgentSettingsRow,
} from "./agent.settings.ports"
import { ListAgentSettings } from "./agent.settings.list.usecase"
import { ValidateExecutablePathFn } from "./validate-agent-path"

export type ApplyImportedAgents = (body: ImportApplyBody) => AgentSettingsResult<AgentSettings[]>

export type ApplyImportedAgentsDeps = Readonly<{
  findRow: FindAgentSettingsRow
  insertRow: InsertAgentSettingsRow
  updateRow: UpdateAgentSettingsRow
  list: ListAgentSettings
  validatePath: ValidateExecutablePathFn
}>

const nowIso = () => new Date().toISOString()

export const makeApplyImportedAgents =
  (deps: ApplyImportedAgentsDeps): ApplyImportedAgents =>
  (body) => {
    const updatedAt = nowIso()

    for (const agent of body.agents) {
      const nextPath = agent.path ?? agent.spawn.binaryName
      if (agent.path !== null && !deps.validatePath(agent.path)) {
        return { ok: false, error: { kind: "path_invalid", path: agent.path } }
      }

      const nextArgs = serializeArgs(agent.spawn.command.slice(1))
      const spawnSnapshotJson = isCatalogAgentId(agent.id)
        ? null
        : serializeSpawnSnapshot(agent.spawn)

      const current = deps.findRow(agent.id)

      if (current === undefined) {
        deps.insertRow({
          agentId: agent.id,
          enabled: true,
          path: nextPath,
          args: nextArgs,
          spawnSnapshot: spawnSnapshotJson,
          updatedAt,
        })
        continue
      }

      deps.updateRow({
        agentId: agent.id,
        patch: {
          enabled: true,
          path: nextPath,
          args: nextArgs,
          spawnSnapshot: spawnSnapshotJson ?? current.spawnSnapshot,
          updatedAt,
        },
      })
    }

    return { ok: true, value: deps.list() }
  }
