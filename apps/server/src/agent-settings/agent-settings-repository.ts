import { eq } from "drizzle-orm"
import {
  AgentId,
  AgentSettings,
  AgentSpawnSnapshot,
  ImportApplyBody,
  ImportDetectCandidate,
  ImportDetectResponse,
  UpdateAgentSettingsBody,
} from "contracts/http/agent-settings"
import { AgentDatabase } from "../persistence/database"
import { agentSettings } from "../persistence/schema/agent-settings"
import { ensureCatalogAgentSettingsRows } from "../acp/catalog/ensure.catalog.agent.settings"
import { PresenceProbeContext } from "../acp/catalog/agent.profile.override"
import { probePresence } from "../acp/catalog/probe.presence"
import { resolveCatalogSpawn } from "../acp/catalog/resolve.catalog.spawn"
import { registrySnapshotSchema } from "../acp/catalog/registry.schema"
import {
  agentDefinitions,
  isCatalogAgentId,
  isPopularAgentId,
  parseSpawnSnapshot,
  serializeSpawnSnapshot,
  sortAgentSettingsBands,
  toAgentSettings,
} from "./agent-registry"
import { resolveAgentPath, WhichFn } from "./resolve-agent-path"
import {
  validateExecutablePath,
  ValidateExecutablePathFn,
} from "./validate-agent-path"
import { catalogAgentsById } from "../acp/catalog/generated/catalog.agents.generated"

export type AgentSettingsRepositoryError =
  | { kind: "not_found" }
  | { kind: "cannot_enable" }
  | { kind: "path_not_found" }
  | { kind: "path_auto_detect_failed" }
  | { kind: "path_invalid"; path: string }
  | { kind: "registry_fetch_failed" }

export type AgentSettingsRepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AgentSettingsRepositoryError }

type AgentSettingsRow = typeof agentSettings.$inferSelect

export type FetchRegistryFn = (url: string) => Promise<unknown>

export const defaultAcpRegistryUrl =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"

export type AgentSettingsRepository = {
  list: () => AgentSettings[]
  getSpawnSnapshot: (agentId: AgentId) => AgentSpawnSnapshot | null
  detectPath: (agentId: AgentId) => AgentSettingsRepositoryResult<{ path: string }>
  update: (input: {
    agentId: AgentId
    body: UpdateAgentSettingsBody
  }) => AgentSettingsRepositoryResult<AgentSettings>
  importDetect: () => Promise<AgentSettingsRepositoryResult<ImportDetectResponse>>
  importApply: (
    body: ImportApplyBody,
  ) => AgentSettingsRepositoryResult<AgentSettings[]>
}

export type CreateAgentSettingsRepositoryOptions = {
  whichFn?: WhichFn
  validateExecutablePathFn?: ValidateExecutablePathFn
  env?: Readonly<Record<string, string | undefined>>
  fetchRegistryFn?: FetchRegistryFn
  registryUrl?: string
}

const nowIso = () => new Date().toISOString()

const createPresenceCtx = (
  whichFn: WhichFn,
  env: Readonly<Record<string, string | undefined>>,
): PresenceProbeContext => ({
  which: whichFn,
  env,
})

const resolveDisplayName = (
  agentId: AgentId,
  row: AgentSettingsRow | undefined,
): string => {
  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
  if (catalogAgent !== undefined) {
    return catalogAgent.displayName
  }

  const snapshot = parseSpawnSnapshot(row?.spawnSnapshot ?? null)
  if (snapshot !== null) {
    return snapshot.displayName
  }

  return agentId
}

const resolveAvailable = (agentId: AgentId): boolean => {
  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
  return catalogAgent?.available ?? true
}

const resolveBinaryNameForPath = (
  agentId: AgentId,
  spawnSnapshot: AgentSpawnSnapshot | null,
): string | null => {
  const definition = agentDefinitions[agentId]
  if (definition !== undefined) {
    return definition.binaryName
  }

  return spawnSnapshot?.binaryName ?? null
}

const detectPathForAgent = (
  agentId: AgentId,
  whichFn: WhichFn,
  spawnSnapshot: AgentSpawnSnapshot | null,
): string | null => {
  const binaryName = resolveBinaryNameForPath(agentId, spawnSnapshot)
  if (binaryName === null) {
    return null
  }
  return resolveAgentPath(binaryName, whichFn)
}

const resolvePathForUpdate = (
  agentId: AgentId,
  body: UpdateAgentSettingsBody,
  whichFn: WhichFn,
  validatePath: ValidateExecutablePathFn,
  spawnSnapshot: AgentSpawnSnapshot | null,
): AgentSettingsRepositoryResult<string> => {
  if ("path" in body) {
    if (!validatePath(body.path)) {
      return { ok: false, error: { kind: "path_invalid", path: body.path } }
    }
    return { ok: true, value: body.path }
  }

  const detectedPath = detectPathForAgent(agentId, whichFn, spawnSnapshot)
  if (!detectedPath) {
    return { ok: false, error: { kind: "path_not_found" } }
  }
  if (!validatePath(detectedPath)) {
    return { ok: false, error: { kind: "path_invalid", path: detectedPath } }
  }
  return { ok: true, value: detectedPath }
}

const toSettingsFromRow = (
  agentId: AgentId,
  row: AgentSettingsRow | undefined,
  presenceCtx: PresenceProbeContext,
): AgentSettings => {
  const spawnSnapshot = parseSpawnSnapshot(row?.spawnSnapshot ?? null)
  const presence = probePresence(agentId, presenceCtx, spawnSnapshot ?? undefined)

  return toAgentSettings({
    id: agentId,
    displayName: resolveDisplayName(agentId, row),
    available: resolveAvailable(agentId),
    enabled: row?.enabled ?? false,
    path: row?.path ?? null,
    present: presence.present,
    popular: isPopularAgentId(agentId),
  })
}

export const createAgentSettingsRepository = (
  database: AgentDatabase,
  options: CreateAgentSettingsRepositoryOptions = {},
): AgentSettingsRepository => {
  const whichFn: WhichFn = options.whichFn ?? ((name) => Bun.which(name))
  const validatePath = options.validateExecutablePathFn ?? validateExecutablePath
  const env = options.env ?? process.env
  const fetchRegistryFn =
    options.fetchRegistryFn ??
    (async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`registry fetch failed: ${response.status}`)
      }
      return response.json()
    })
  const registryUrl = options.registryUrl ?? defaultAcpRegistryUrl
  const presenceCtx = () => createPresenceCtx(whichFn, env)

  ensureCatalogAgentSettingsRows(database)

  const list = (): AgentSettings[] => {
    const rows = database.db.select().from(agentSettings).all()
    const rowsById = new Map(rows.map((row) => [row.agentId, row]))
    const ctx = presenceCtx()

    const catalogItems = Object.keys(catalogAgentsById).map((agentId) =>
      toSettingsFromRow(agentId, rowsById.get(agentId), ctx),
    )

    const registryAheadItems = rows
      .filter((row) => !isCatalogAgentId(row.agentId))
      .map((row) => toSettingsFromRow(row.agentId, row, ctx))

    return sortAgentSettingsBands([...catalogItems, ...registryAheadItems])
  }

  const getSpawnSnapshot = (agentId: AgentId): AgentSpawnSnapshot | null => {
    const row = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, agentId))
      .get()

    return parseSpawnSnapshot(row?.spawnSnapshot ?? null)
  }

  const detectPath = (
    agentId: AgentId,
  ): AgentSettingsRepositoryResult<{ path: string }> => {
    const row = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, agentId))
      .get()

    const spawnSnapshot = parseSpawnSnapshot(row?.spawnSnapshot ?? null)
    if (!isCatalogAgentId(agentId) && spawnSnapshot === null && row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    if (!isCatalogAgentId(agentId) && row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    const detectedPath = detectPathForAgent(agentId, whichFn, spawnSnapshot)
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
    const current = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, agentId))
      .get()

    if (!current) {
      return { ok: false, error: { kind: "not_found" } }
    }

    if (body.enabled && !resolveAvailable(agentId)) {
      return { ok: false, error: { kind: "cannot_enable" } }
    }

    const spawnSnapshot = parseSpawnSnapshot(current.spawnSnapshot)
    const nextEnabled = body.enabled
    let nextPath = current.path

    if ("path" in body) {
      const resolvedPath = resolvePathForUpdate(
        agentId,
        body,
        whichFn,
        validatePath,
        spawnSnapshot,
      )
      if (!resolvedPath.ok) {
        return resolvedPath
      }
      nextPath = resolvedPath.value
    } else if (nextEnabled && current.path === null) {
      const detectedPath = detectPathForAgent(agentId, whichFn, spawnSnapshot)
      if (!detectedPath || !validatePath(detectedPath)) {
        const partialRow: AgentSettingsRow = {
          ...current,
          enabled: true,
          path: null,
          updatedAt: nowIso(),
        }

        database.db
          .update(agentSettings)
          .set({
            enabled: partialRow.enabled,
            path: partialRow.path,
            updatedAt: partialRow.updatedAt,
          })
          .where(eq(agentSettings.agentId, agentId))
          .run()

        return { ok: false, error: { kind: "path_auto_detect_failed" } }
      }

      nextPath = detectedPath
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

    return { ok: true, value: toSettingsFromRow(agentId, nextRow, presenceCtx()) }
  }

  const importDetect = async (): Promise<
    AgentSettingsRepositoryResult<ImportDetectResponse>
  > => {
    try {
      const payload = await fetchRegistryFn(registryUrl)
      const snapshot = registrySnapshotSchema.parse(payload)
      const rows = database.db.select().from(agentSettings).all()
      const rowsById = new Map(rows.map((row) => [row.agentId, row]))
      const ctx = presenceCtx()

      const items: ImportDetectCandidate[] = snapshot.agents.map((agent) => {
        const spawn = resolveCatalogSpawn(agent)
        const spawnSnapshot: AgentSpawnSnapshot = {
          kind: spawn.kind,
          binaryName: spawn.binaryName,
          command: [...spawn.command],
          displayName: agent.name,
          authMethodId: agent.id,
        }
        const presence = probePresence(agent.id, ctx, spawn)
        const row = rowsById.get(agent.id)

        return {
          id: agent.id,
          displayName: agent.name,
          present: presence.present,
          path: presence.path,
          inCatalog: isCatalogAgentId(agent.id),
          alreadyEnabled: row?.enabled ?? false,
          spawn: spawnSnapshot,
        }
      })

      return {
        ok: true,
        value: {
          items: items.filter((item) => item.present),
        },
      }
    } catch {
      return { ok: false, error: { kind: "registry_fetch_failed" } }
    }
  }

  const importApply = (
    body: ImportApplyBody,
  ): AgentSettingsRepositoryResult<AgentSettings[]> => {
    const updatedAt = nowIso()

    for (const agent of body.agents) {
      const nextPath = agent.path
      if (nextPath !== null && !validatePath(nextPath)) {
        return { ok: false, error: { kind: "path_invalid", path: nextPath } }
      }

      const spawnSnapshotJson = isCatalogAgentId(agent.id)
        ? null
        : serializeSpawnSnapshot(agent.spawn)

      const current = database.db
        .select()
        .from(agentSettings)
        .where(eq(agentSettings.agentId, agent.id))
        .get()

      if (current === undefined) {
        database.db
          .insert(agentSettings)
          .values({
            agentId: agent.id,
            enabled: true,
            path: nextPath,
            spawnSnapshot: spawnSnapshotJson,
            updatedAt,
          })
          .run()
        continue
      }

      database.db
        .update(agentSettings)
        .set({
          enabled: true,
          path: nextPath ?? current.path,
          spawnSnapshot: spawnSnapshotJson ?? current.spawnSnapshot,
          updatedAt,
        })
        .where(eq(agentSettings.agentId, agent.id))
        .run()
    }

    return { ok: true, value: list() }
  }

  return {
    list,
    getSpawnSnapshot,
    detectPath,
    update,
    importDetect,
    importApply,
  }
}
