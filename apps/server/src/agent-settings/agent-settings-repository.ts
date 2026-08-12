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
import { sessions } from "../persistence/schema/sessions"
import { ensureCatalogAgentSettingsRows } from "../acp/catalog/ensure.catalog.agent.settings"
import { PresenceProbeContext } from "../acp/catalog/agent.profile.override"
import { probePresence } from "../acp/catalog/probe.presence"
import { resolveCatalogSpawn } from "../acp/catalog/resolve.catalog.spawn"
import { registrySnapshotSchema } from "../acp/catalog/registry.schema"
import { agentSupportsSessionList } from "../acp/catalog/session.list.support"
import {
  isCatalogAgentId,
  isPopularAgentId,
  parseSpawnSnapshot,
  resolveTemplateArgs,
  resolveTemplateBinaryName,
  serializeSpawnSnapshot,
  sortAgentSettingsBands,
  toAgentSettings,
} from "./agent-registry"
import {
  allocateCustomAgentId,
  allocateCustomDisplayName,
  isCustomAgentId,
} from "./custom.agent.id"
import { parseArgs, serializeArgs } from "./agent.settings.args"
import { resolveAgentPath, WhichFn } from "./resolve-agent-path"
import {
  validateExecutablePath,
  ValidateExecutablePathFn,
} from "./validate-agent-path"
import { catalogAgentsById } from "../acp/catalog/generated/catalog.agents.generated"

const unsetCustomBinaryName = "custom"

const buildCustomSpawnSnapshot = (
  agentId: AgentId,
  displayName: string,
  path: string | null,
  args: readonly string[],
): AgentSpawnSnapshot => {
  if (path === null || path === "") {
    return {
      kind: "binary",
      binaryName: unsetCustomBinaryName,
      command: [unsetCustomBinaryName],
      displayName,
      authMethodId: agentId,
    }
  }

  return {
    kind: "binary",
    binaryName: path,
    command: [path, ...args],
    displayName,
    authMethodId: agentId,
  }
}

export type AgentSettingsRepositoryError =
  | { kind: "not_found" }
  | { kind: "cannot_enable" }
  | { kind: "cannot_rename" }
  | { kind: "cannot_delete" }
  | { kind: "id_conflict" }
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
  createCustom: () => AgentSettingsRepositoryResult<AgentSettings>
  update: (input: {
    agentId: AgentId
    body: UpdateAgentSettingsBody
  }) => AgentSettingsRepositoryResult<AgentSettings>
  remove: (agentId: AgentId) => AgentSettingsRepositoryResult<void>
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

const detectPathForAgent = (
  agentId: AgentId,
  whichFn: WhichFn,
  spawnSnapshot: AgentSpawnSnapshot | null,
): string | null => {
  const binaryName = resolveTemplateBinaryName(agentId, spawnSnapshot)
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

const needsArgsSeed = (rawArgs: string | null): boolean => {
  const parsed = parseArgs(rawArgs)
  return parsed === null || parsed.length === 0
}

const toSettingsFromRow = (
  agentId: AgentId,
  row: AgentSettingsRow | undefined,
  presenceCtx: PresenceProbeContext,
  validatePath: ValidateExecutablePathFn,
): AgentSettings => {
  const spawnSnapshot = parseSpawnSnapshot(row?.spawnSnapshot ?? null)
  const presence = probePresence(agentId, presenceCtx, spawnSnapshot ?? undefined)
  const storedArgs = parseArgs(row?.args ?? null)
  const path = isCustomAgentId(agentId)
    ? (row?.path ?? null)
    : (row?.path ?? resolveTemplateBinaryName(agentId, spawnSnapshot))
  const present =
    isCustomAgentId(agentId)
      ? path !== null && validatePath(path)
      : presence.present

  return toAgentSettings({
    id: agentId,
    displayName: resolveDisplayName(agentId, row),
    available: resolveAvailable(agentId),
    enabled: row?.enabled ?? false,
    path,
    args: isCustomAgentId(agentId)
      ? (storedArgs ?? [])
      : (storedArgs ?? resolveTemplateArgs(agentId, spawnSnapshot)),
    present,
    popular: isPopularAgentId(agentId),
    deletable: !isCatalogAgentId(agentId),
    sessionListSupported: agentSupportsSessionList(agentId),
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
      toSettingsFromRow(agentId, rowsById.get(agentId), ctx, validatePath),
    )

    const nonCatalogRows = rows.filter((row) => !isCatalogAgentId(row.agentId))
    const customRows = nonCatalogRows
      .filter((row) => isCustomAgentId(row.agentId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    const registryAheadRows = nonCatalogRows.filter(
      (row) => !isCustomAgentId(row.agentId),
    )

    const customItems = customRows.map((row) =>
      toSettingsFromRow(row.agentId, row, ctx, validatePath),
    )
    const registryAheadItems = registryAheadRows.map((row) =>
      toSettingsFromRow(row.agentId, row, ctx, validatePath),
    )

    return [
      ...customItems,
      ...sortAgentSettingsBands([...catalogItems, ...registryAheadItems]),
    ]
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

  const createCustom = (): AgentSettingsRepositoryResult<AgentSettings> => {
    const rows = database.db.select().from(agentSettings).all()
    const existingIds = new Set(rows.map((row) => row.agentId))
    const existingNames = new Set(
      rows.map((row) => resolveDisplayName(row.agentId, row)),
    )

    const displayName = allocateCustomDisplayName(existingNames)
    const agentId = allocateCustomAgentId(displayName, existingIds)
    const spawnSnapshot = buildCustomSpawnSnapshot(agentId, displayName, null, [])
    const updatedAt = nowIso()

    database.db
      .insert(agentSettings)
      .values({
        agentId,
        enabled: false,
        path: null,
        args: serializeArgs([]),
        spawnSnapshot: serializeSpawnSnapshot(spawnSnapshot),
        updatedAt,
      })
      .run()

    const row = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, agentId))
      .get()

    return {
      ok: true,
      value: toSettingsFromRow(agentId, row, presenceCtx(), validatePath),
    }
  }

  const renameCustom = (
    agentId: AgentId,
    displayName: string,
  ): AgentSettingsRepositoryResult<AgentSettings> => {
    if (!isCustomAgentId(agentId)) {
      return { ok: false, error: { kind: "cannot_rename" } }
    }

    const current = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, agentId))
      .get()

    if (current === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    const rows = database.db.select().from(agentSettings).all()
    const existingIds = new Set(
      rows.map((row) => row.agentId).filter((id) => id !== agentId),
    )
    const nextId = allocateCustomAgentId(displayName, existingIds)

    if (isCatalogAgentId(nextId) || existingIds.has(nextId)) {
      return { ok: false, error: { kind: "id_conflict" } }
    }

    const args = parseArgs(current.args) ?? []
    const spawnSnapshot = buildCustomSpawnSnapshot(
      nextId,
      displayName,
      current.path,
      args,
    )
    const updatedAt = nowIso()

    if (nextId !== agentId) {
      database.db
        .update(sessions)
        .set({ agentId: nextId })
        .where(eq(sessions.agentId, agentId))
        .run()
    }

    database.db
      .update(agentSettings)
      .set({
        agentId: nextId,
        spawnSnapshot: serializeSpawnSnapshot(spawnSnapshot),
        updatedAt,
      })
      .where(eq(agentSettings.agentId, agentId))
      .run()

    const row = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, nextId))
      .get()

    return {
      ok: true,
      value: toSettingsFromRow(nextId, row, presenceCtx(), validatePath),
    }
  }

  const update = ({
    agentId,
    body,
  }: {
    agentId: AgentId
    body: UpdateAgentSettingsBody
  }): AgentSettingsRepositoryResult<AgentSettings> => {
    if ("displayName" in body) {
      return renameCustom(agentId, body.displayName)
    }

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

    if (body.enabled && !agentSupportsSessionList(agentId)) {
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
          args: nextArgs,
          updatedAt: nowIso(),
        }

        database.db
          .update(agentSettings)
          .set({
            enabled: partialRow.enabled,
            path: partialRow.path,
            args: partialRow.args,
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

    database.db
      .update(agentSettings)
      .set({
        enabled: nextRow.enabled,
        path: nextRow.path,
        args: nextRow.args,
        spawnSnapshot: nextRow.spawnSnapshot,
        updatedAt: nextRow.updatedAt,
      })
      .where(eq(agentSettings.agentId, agentId))
      .run()

    return {
      ok: true,
      value: toSettingsFromRow(agentId, nextRow, presenceCtx(), validatePath),
    }
  }

  const remove = (agentId: AgentId): AgentSettingsRepositoryResult<void> => {
    if (isCatalogAgentId(agentId)) {
      return { ok: false, error: { kind: "cannot_delete" } }
    }

    const current = database.db
      .select()
      .from(agentSettings)
      .where(eq(agentSettings.agentId, agentId))
      .get()

    if (current === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    database.db.delete(sessions).where(eq(sessions.agentId, agentId)).run()
    database.db.delete(agentSettings).where(eq(agentSettings.agentId, agentId)).run()

    return { ok: true, value: undefined }
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
      const nextPath = agent.path ?? agent.spawn.binaryName
      if (agent.path !== null && !validatePath(agent.path)) {
        return { ok: false, error: { kind: "path_invalid", path: agent.path } }
      }

      const nextArgs = serializeArgs(agent.spawn.command.slice(1))
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
            args: nextArgs,
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
          path: nextPath,
          args: nextArgs,
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
    createCustom,
    update,
    remove,
    importDetect,
    importApply,
  }
}
