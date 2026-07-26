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

export type AgentSettingsRepositoryError =
  | { kind: "not_found" }
  | { kind: "cannot_enable" }

export type AgentSettingsRepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AgentSettingsRepositoryError }

type AgentSettingsRow = typeof agentSettings.$inferSelect

export type AgentSettingsRepository = {
  list: () => AgentSettings[]
  update: (input: {
    agentId: AgentId
    body: UpdateAgentSettingsBody
  }) => AgentSettingsRepositoryResult<AgentSettings>
}

export type CreateAgentSettingsRepositoryOptions = {
  whichFn?: WhichFn
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

const computeNextRow = (
  agentId: AgentId,
  current: AgentSettingsRow,
  body: UpdateAgentSettingsBody,
  whichFn: WhichFn,
): AgentSettingsRow => {
  const nextEnabled = body.enabled ?? current.enabled
  const nextPathOverride =
    body.pathOverride === undefined ? current.pathOverride : body.pathOverride

  const shouldDetect =
    nextPathOverride === null &&
    (body.enabled === true || (body.pathOverride === null && nextEnabled))

  const nextDetectedPath = shouldDetect
    ? detectPathForAgent(agentId, whichFn)
    : current.detectedPath

  return {
    ...current,
    enabled: nextEnabled,
    pathOverride: nextPathOverride,
    detectedPath: nextDetectedPath,
    updatedAt: nowIso(),
  }
}

export const createAgentSettingsRepository = (
  database: AgentDatabase,
  options: CreateAgentSettingsRepositoryOptions = {},
): AgentSettingsRepository => {
  const whichFn: WhichFn = options.whichFn ?? ((name) => Bun.which(name))

  const list = (): AgentSettings[] => {
    const rows = database.db.select().from(agentSettings).all()
    const rowsById = new Map(rows.map((row) => [row.agentId, row]))

    return agentDefinitionList.map((definition) => {
      const row = rowsById.get(definition.id)
      return row
        ? rowToAgentSettings(row)
        : toAgentSettings(definition, {
            enabled: false,
            pathOverride: null,
            detectedPath: null,
          })
    })
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

    if (body.enabled === true && !definition.available) {
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

    const nextRow = computeNextRow(agentId, current, body, whichFn)

    database.db
      .update(agentSettings)
      .set({
        enabled: nextRow.enabled,
        pathOverride: nextRow.pathOverride,
        detectedPath: nextRow.detectedPath,
        updatedAt: nextRow.updatedAt,
      })
      .where(eq(agentSettings.agentId, agentId))
      .run()

    return { ok: true, value: rowToAgentSettings(nextRow) }
  }

  return {
    list,
    update,
  }
}
