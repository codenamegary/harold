import {
  normalizeAdvertisedUrl,
  RuntimeSettings,
  RuntimeSettingsSchema,
  UpdateRuntimeSettingsBody,
} from "contracts/http/runtime-settings"
import { DeleteWorkspace, ListAllWorkspaces } from "../workspace/workspace.ports"
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

const mergeRuntimeSettings = (
  previous: RuntimeSettings,
  body: UpdateRuntimeSettingsBody,
): RuntimeSettings => {
  const advertisedUrl = normalizeAdvertisedUrl(body.advertisedUrl)

  return {
    advertisedUrl:
      advertisedUrl === undefined ? previous.advertisedUrl : advertisedUrl,
    advertisedUrlEnabled:
      body.advertisedUrlEnabled ?? previous.advertisedUrlEnabled,
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

    let resolvedBody = body
    if (body.allowedRoots !== undefined) {
      const canonicalRoots: string[] = []
      for (const [index, root] of body.allowedRoots.entries()) {
        const canonicalizeResult = deps.canonicalizePath(root)
        if (!canonicalizeResult.ok) {
          return {
            ok: false,
            error: {
              kind: "invalid_allowed_root",
              error: canonicalizeResult.error,
              index,
            },
          }
        }

        if (!canonicalRoots.includes(canonicalizeResult.canonicalPath)) {
          canonicalRoots.push(canonicalizeResult.canonicalPath)
        }
      }

      const affected = findWorkspacesAffectedByRootRemoval({
        workspaces: deps.listAllWorkspaces(),
        previousRoots: previous.allowedRoots,
        nextRoots: canonicalRoots,
      })

      if (affected.length > 0 && !force) {
        const detail = `${affected.length} workspace${affected.length === 1 ? "" : "s"} must be unregistered before this root can be removed`
        return {
          ok: false,
          error: { kind: "allowed_root_has_workspaces", detail },
        }
      }

      if (affected.length > 0 && force) {
        for (const workspace of affected) {
          const deleted = await deps.deleteWorkspace({
            workspaceId: workspace.id,
            force: true,
          })

          if (!deleted.ok && deleted.error.kind === "not_found") {
            return { ok: false, error: { kind: "workspace_not_found" } }
          }
        }
      }

      resolvedBody = { ...body, allowedRoots: canonicalRoots }
    }

    const next = deps.saveSettings(
      RuntimeSettingsSchema.parse(mergeRuntimeSettings(previous, resolvedBody)),
    )

    const logLevelChanged =
      body.logLevel !== undefined && body.logLevel !== previous.logLevel
    if (logLevelChanged) {
      deps.onLogLevelChanged?.(next.logLevel)
    }

    return { ok: true, value: { settings: next, logLevelChanged } }
  }
