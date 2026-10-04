import {
  normalizeAdvertisedUrl,
  RuntimeSettings,
  RuntimeSettingsSchema,
  UpdateRuntimeSettingsBody,
} from "contracts/http/runtime-settings"
import { Workspace } from "contracts/http/workspace"
import { FilesystemPathError } from "core/filesystem/errors"
import { DeleteWorkspace, ListAllWorkspaces } from "core/workspace/ports"
import { findWorkspacesAffectedByRootRemoval } from "./find.workspaces.affected.by.root.removal"
import { UpdateRuntimeSettingsError } from "./runtime-settings.errors"
import {
  CanonicalizePath,
  GetRuntimeSettings,
  OnLogLevelChanged,
  SaveRuntimeSettings,
} from "./runtime-settings.ports"

export type UpdateRuntimeSettingsCommand = Readonly<{
  body: UpdateRuntimeSettingsBody
  force: boolean
}>

export type UpdateRuntimeSettingsSuccess = Readonly<{
  settings: RuntimeSettings
  logLevelChanged: boolean
}>

export type UpdateRuntimeSettingsResult =
  | { ok: true; value: UpdateRuntimeSettingsSuccess }
  | { ok: false; error: UpdateRuntimeSettingsError }

export type UpdateRuntimeSettings = (
  command: UpdateRuntimeSettingsCommand,
) => Promise<UpdateRuntimeSettingsResult>

export type UpdateRuntimeSettingsDeps = Readonly<{
  getSettings: GetRuntimeSettings
  saveSettings: SaveRuntimeSettings
  canonicalizePath: CanonicalizePath
  listAllWorkspaces: ListAllWorkspaces
  deleteWorkspace: DeleteWorkspace
  onLogLevelChanged?: OnLogLevelChanged
}>

type CanonicalRootsResult =
  | { ok: true; canonicalRoots: string[] }
  | { ok: false; error: FilesystemPathError; index: number }

type ReconcileRootsResult = { ok: true } | { ok: false; error: UpdateRuntimeSettingsError }

const canonicalizeRoots = (
  canonicalizePath: CanonicalizePath,
  roots: readonly string[],
): CanonicalRootsResult =>
  roots.reduce<CanonicalRootsResult>(
    (acc, root, index) => {
      if (!acc.ok) return acc

      const result = canonicalizePath(root)
      if (!result.ok) {
        return { ok: false, error: result.error, index }
      }

      return {
        ok: true,
        canonicalRoots: [...new Set([...acc.canonicalRoots, result.canonicalPath])],
      }
    },
    { ok: true, canonicalRoots: [] },
  )

const affectedWorkspacesDetail = (count: number): string =>
  `${count} workspace${count === 1 ? "" : "s"} must be unregistered before this root can be removed`

const deleteAffectedWorkspaces = async (
  deps: UpdateRuntimeSettingsDeps,
  affected: ReadonlyArray<Workspace>,
): Promise<ReconcileRootsResult> =>
  affected.reduce(
    async (outcome, workspace) => {
      const prior = await outcome
      if (!prior.ok) return prior

      const deleted = await deps.deleteWorkspace({
        workspaceId: workspace.id,
        force: true,
      })

      return deleted.ok || deleted.error.kind !== "not_found"
        ? { ok: true as const }
        : { ok: false as const, error: { kind: "workspace_not_found" as const } }
    },
    Promise.resolve<ReconcileRootsResult>({ ok: true }),
  )

const reconcileRootRemoval = async (
  deps: UpdateRuntimeSettingsDeps,
  params: {
    previousRoots: readonly string[]
    nextRoots: readonly string[] | undefined
    force: boolean
  },
): Promise<ReconcileRootsResult> => {
  if (params.nextRoots === undefined) return { ok: true }

  const affected = findWorkspacesAffectedByRootRemoval({
    workspaces: deps.listAllWorkspaces(),
    previousRoots: params.previousRoots,
    nextRoots: params.nextRoots,
  })

  if (affected.length === 0) return { ok: true }

  if (params.force) return deleteAffectedWorkspaces(deps, affected)

  return {
    ok: false,
    error: {
      kind: "allowed_root_has_workspaces",
      detail: affectedWorkspacesDetail(affected.length),
    },
  }
}

const mergeRuntimeSettings = (
  previous: RuntimeSettings,
  body: UpdateRuntimeSettingsBody,
): RuntimeSettings => {
  const advertisedUrl = normalizeAdvertisedUrl(body.advertisedUrl)

  return {
    advertisedUrl: advertisedUrl === undefined ? previous.advertisedUrl : advertisedUrl,
    advertisedUrlEnabled: body.advertisedUrlEnabled ?? previous.advertisedUrlEnabled,
    trustedProxies: body.trustedProxies ?? previous.trustedProxies,
    bindHost: body.bindHost ?? previous.bindHost,
    bindPort: body.bindPort ?? previous.bindPort,
    logLevel: body.logLevel ?? previous.logLevel,
    logPath: body.logPath === undefined ? previous.logPath : body.logPath,
    allowedRoots: body.allowedRoots ?? previous.allowedRoots,
  }
}

export const makeUpdateRuntimeSettings =
  (deps: UpdateRuntimeSettingsDeps): UpdateRuntimeSettings =>
  async (command) => {
    const { body, force } = command
    const previous = deps.getSettings()

    const canonical =
      body.allowedRoots === undefined
        ? { ok: true as const, canonicalRoots: undefined }
        : canonicalizeRoots(deps.canonicalizePath, body.allowedRoots)
    if (!canonical.ok) {
      return {
        ok: false,
        error: {
          kind: "invalid_allowed_root",
          error: canonical.error,
          index: canonical.index,
        },
      }
    }

    const reconciled = await reconcileRootRemoval(deps, {
      previousRoots: previous.allowedRoots,
      nextRoots: canonical.canonicalRoots,
      force,
    })
    if (!reconciled.ok) return reconciled

    const resolvedBody: UpdateRuntimeSettingsBody =
      canonical.canonicalRoots === undefined
        ? body
        : { ...body, allowedRoots: canonical.canonicalRoots }

    const next = deps.saveSettings(
      RuntimeSettingsSchema.parse(mergeRuntimeSettings(previous, resolvedBody)),
    )

    const logLevelChanged = body.logLevel !== undefined && body.logLevel !== previous.logLevel
    if (logLevelChanged) {
      deps.onLogLevelChanged?.(next.logLevel)
    }

    return { ok: true, value: { settings: next, logLevelChanged } }
  }
