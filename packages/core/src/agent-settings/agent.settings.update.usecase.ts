import { AgentId, AgentSettings, UpdateAgentSettingsBody } from "contracts/http/agent-settings"
import { catalogAgentsById } from "../agent-catalog/generated/catalog.agents.generated"
import {
  isCatalogAgentId,
  parseSpawnSnapshot,
  resolveTemplateArgs,
  serializeSpawnSnapshot,
} from "./agent-registry"
import { parseArgs, serializeArgs } from "./agent.settings.args"
import { buildCustomSpawnSnapshot } from "./agent.settings.custom.snapshot"
import { detectPathForAgent } from "./agent.settings.detect.path.usecase"
import { AgentSettingsResult } from "./agent.settings.errors"
import {
  AgentSettingsRow,
  BuildAgentSettingsView,
  FindAgentSettingsRow,
  ListAgentSettingsRows,
  UpdateAgentSettingsRow,
} from "./agent.settings.ports"
import { resolveDisplayName } from "./agent.settings.view"
import { allocateCustomAgentId, isCustomAgentId } from "./custom.agent.id"
import { WhichFn } from "./resolve-agent-path"
import { ValidateExecutablePathFn } from "./validate-agent-path"

export type UpdateAgentSettings = (input: {
  agentId: AgentId
  body: UpdateAgentSettingsBody
}) => AgentSettingsResult<AgentSettings>

export type UpdateAgentSettingsDeps = Readonly<{
  listRows: ListAgentSettingsRows
  findRow: FindAgentSettingsRow
  updateRow: UpdateAgentSettingsRow
  buildView: BuildAgentSettingsView
  whichFn: WhichFn
  validatePath: ValidateExecutablePathFn
}>

const nowIso = () => new Date().toISOString()

const resolveAvailable = (agentId: AgentId): boolean => {
  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
  return catalogAgent?.available ?? true
}

const needsArgsSeed = (rawArgs: string | null): boolean => {
  const parsed = parseArgs(rawArgs)
  return parsed === null || parsed.length === 0
}

const renameCustom = (
  deps: UpdateAgentSettingsDeps,
  agentId: AgentId,
  displayName: string,
): AgentSettingsResult<AgentSettings> => {
  if (!isCustomAgentId(agentId)) {
    return { ok: false, error: { kind: "cannot_rename" } }
  }

  const current = deps.findRow(agentId)

  if (current === undefined) {
    return { ok: false, error: { kind: "not_found" } }
  }

  const existingIds = new Set(
    deps
      .listRows()
      .map((row) => row.agentId)
      .filter((id) => id !== agentId),
  )
  const nextId = allocateCustomAgentId(displayName, existingIds)

  if (isCatalogAgentId(nextId) || existingIds.has(nextId)) {
    return { ok: false, error: { kind: "id_conflict" } }
  }

  const args = parseArgs(current.args) ?? []
  const spawnSnapshot = buildCustomSpawnSnapshot(nextId, displayName, current.path, args)
  const updatedAt = nowIso()

  deps.updateRow({
    agentId,
    patch: {
      agentId: nextId,
      spawnSnapshot: serializeSpawnSnapshot(spawnSnapshot),
      updatedAt,
    },
  })

  const row = deps.findRow(nextId)

  return { ok: true, value: deps.buildView(nextId, row) }
}

export const makeUpdateAgentSettings =
  (deps: UpdateAgentSettingsDeps): UpdateAgentSettings =>
  ({ agentId, body }) => {
    if ("displayName" in body) {
      return renameCustom(deps, agentId, body.displayName)
    }

    const current = deps.findRow(agentId)

    if (!current) {
      return { ok: false, error: { kind: "not_found" } }
    }

    if (body.enabled && !resolveAvailable(agentId)) {
      return { ok: false, error: { kind: "cannot_enable" } }
    }

    const spawnSnapshot = parseSpawnSnapshot(current.spawnSnapshot)
    const nextEnabled = body.enabled
    let nextPath = current.path
    let nextArgs = current.args

    if ("args" in body) {
      nextArgs = serializeArgs(body.args)
    } else if (nextEnabled && needsArgsSeed(current.args)) {
      nextArgs = serializeArgs(resolveTemplateArgs(agentId, spawnSnapshot))
    }

    if ("path" in body) {
      if (!deps.validatePath(body.path)) {
        return { ok: false, error: { kind: "path_invalid", path: body.path } }
      }
      nextPath = body.path
    } else if (nextEnabled && current.path === null) {
      const detectedPath = detectPathForAgent(agentId, deps.whichFn, spawnSnapshot)
      if (!detectedPath || !deps.validatePath(detectedPath)) {
        deps.updateRow({
          agentId,
          patch: {
            enabled: true,
            path: null,
            args: nextArgs,
            updatedAt: nowIso(),
          },
        })

        return { ok: false, error: { kind: "path_auto_detect_failed" } }
      }

      nextPath = detectedPath
    } else if (nextEnabled && current.path !== null) {
      if (!deps.validatePath(current.path)) {
        return { ok: false, error: { kind: "path_invalid", path: current.path } }
      }
    }

    const parsedArgs = parseArgs(nextArgs) ?? []
    const nextSpawnSnapshot =
      isCustomAgentId(agentId) || spawnSnapshot !== null
        ? isCustomAgentId(agentId)
          ? buildCustomSpawnSnapshot(
              agentId,
              resolveDisplayName(agentId, current),
              nextPath,
              parsedArgs,
            )
          : spawnSnapshot
        : null

    const nextRow: AgentSettingsRow = {
      ...current,
      enabled: nextEnabled,
      path: nextPath,
      args: nextArgs,
      spawnSnapshot:
        nextSpawnSnapshot === null
          ? current.spawnSnapshot
          : serializeSpawnSnapshot(nextSpawnSnapshot),
      updatedAt: nowIso(),
    }

    deps.updateRow({
      agentId,
      patch: {
        enabled: nextRow.enabled,
        path: nextRow.path,
        args: nextRow.args,
        spawnSnapshot: nextRow.spawnSnapshot,
        updatedAt: nextRow.updatedAt,
      },
    })

    return { ok: true, value: deps.buildView(agentId, nextRow) }
  }
