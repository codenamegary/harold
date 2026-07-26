import { eq } from "drizzle-orm"
import {
  AgentId,
  AgentSettings,
  UpdateAgentSettingsBody,
} from "contracts/http/agent-settings"
import { AgentDatabase } from "../persistence/open-database"
import { agentSettings } from "../persistence/schema/agent-settings"
import {
  agentDefinitionList,
  agentDefinitions,
  toAgentSettings,
} from "./agent-registry"
import { resolveAgentPath, WhichFn } from "./resolve-agent-path"
import {
  validateExecutablePath,
  ValidateExecutablePathFn,
} from "./validate-agent-path"

export type AgentSettingsRepositoryError =
  | { kind: "not_found" }
  | { kind: "cannot_enable" }
  | { kind: "path_not_found" }
  | { kind: "path_invalid"; path: string }

export type AgentSettingsRepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AgentSettingsRepositoryError }

type AgentSettingsRow = typeof agentSettings.$inferSelect

export type AgentSettingsRepository = {
  list: () => AgentSettings[]
  detectPath: (agentId: AgentId) => AgentSettingsRepositoryResult<{ path: string }>
  update: (input: {
    agentId: AgentId
    body: UpdateAgentSettingsBody
  }) => AgentSettingsRepositoryResult<AgentSettings>
}

export type CreateAgentSettingsRepositoryOptions = {
  whichFn?: WhichFn
  validateExecutablePathFn?: ValidateExecutablePathFn
}

const nowIso = () => new Date().toISOString()

const rowToAgentSettings = (row: AgentSettingsRow): AgentSettings => {
  const definition = agentDefinitions[row.agentId as AgentId]
  return toAgentSettings(definition, row)
}

const detectPathForAgent = (
  agentId: AgentId,
  whichFn: WhichFn,
): string | null => {
  const definition = agentDefinitions[agentId]
  return resolveAgentPath(definition.binaryName, whichFn)
}

const resolvePathForUpdate = (
  agentId: AgentId,
  body: UpdateAgentSettingsBody,
  whichFn: WhichFn,
  validatePath: ValidateExecutablePathFn,
): AgentSettingsRepositoryResult<string> => {
  if ("path" in body) {
    if (!validatePath(body.path)) {
      return { ok: false, error: { kind: "path_invalid", path: body.path } }
    }
    return { ok: true, value: body.path }
  }

  const detectedPath = detectPathForAgent(agentId, whichFn)
  if (!detectedPath) {
    return { ok: false, error: { kind: "path_not_found" } }
  }
  if (!validatePath(detectedPath)) {
    return { ok: false, error: { kind: "path_invalid", path: detectedPath } }
  }
  return { ok: true, value: detectedPath }
}

export const createAgentSettingsRepository = (
  database: AgentDatabase,
  options: CreateAgentSettingsRepositoryOptions = {},
): AgentSettingsRepository => {
  const whichFn: WhichFn = options.whichFn ?? ((name) => Bun.which(name))
  const validatePath = options.validateExecutablePathFn ?? validateExecutablePath

  const list = (): AgentSettings[] => {
    const rows = database.db.select().from(agentSettings).all()
    const rowsById = new Map(rows.map((row) => [row.agentId, row]))

    return agentDefinitionList.map((definition) => {
      const row = rowsById.get(definition.id)
      return row
        ? rowToAgentSettings(row)
        : toAgentSettings(definition, {
            enabled: false,
            path: null,
          })
    })
  }

  const detectPath = (
    agentId: AgentId,
  ): AgentSettingsRepositoryResult<{ path: string }> => {
    const definition = agentDefinitions[agentId]
    if (!definition) {
      return { ok: false, error: { kind: "not_found" } }
    }

    const detectedPath = detectPathForAgent(agentId, whichFn)
    if (!detectedPath || !validatePath(detectedPath)) {
      return { ok: false, error: { kind: "path_not_found" } }
    }

    return { ok: true, value: { path: detectedPath } }
  }

  const update = ({
    agentId,
    body,
  }: {
    agentId: AgentId
    body: UpdateAgentSettingsBody
  }): AgentSettingsRepositoryResult<AgentSettings> => {
    const definition = agentDefinitions[agentId]
    if (!definition) {
      return { ok: false, error: { kind: "not_found" } }
    }

    if (body.enabled && !definition.available) {
      return { ok: false, error: { kind: "cannot_enable" } }
    }

    const current = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, agentId))
      .get()

    if (!current) {
      return { ok: false, error: { kind: "not_found" } }
    }

    const nextEnabled = body.enabled
    let nextPath = current.path

    if ("path" in body) {
      const resolvedPath = resolvePathForUpdate(agentId, body, whichFn, validatePath)
      if (!resolvedPath.ok) {
        return resolvedPath
      }
      nextPath = resolvedPath.value
    } else if (nextEnabled && current.path === null) {
      const resolvedPath = resolvePathForUpdate(agentId, body, whichFn, validatePath)
      if (!resolvedPath.ok) {
        return resolvedPath
      }
      nextPath = resolvedPath.value
    } else if (nextEnabled && current.path !== null) {
      if (!validatePath(current.path)) {
        return { ok: false, error: { kind: "path_invalid", path: current.path } }
      }
    }

    const nextRow: AgentSettingsRow = {
      ...current,
      enabled: nextEnabled,
      path: nextPath,
      updatedAt: nowIso(),
    }

    database.db
      .update(agentSettings)
      .set({
        enabled: nextRow.enabled,
        path: nextRow.path,
        updatedAt: nextRow.updatedAt,
      })
      .where(eq(agentSettings.agentId, agentId))
      .run()

    return { ok: true, value: rowToAgentSettings(nextRow) }
  }

  return {
    list,
    detectPath,
    update,
  }
}
