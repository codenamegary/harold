import {
  normalizeAdvertisedUrl,
  RuntimeSettings,
  RuntimeSettingsSchema,
  UpdateRuntimeSettingsBody,
} from "contracts/http/runtime-settings"
import {
  GetRuntimeSettings,
  OnLogLevelChanged,
  SaveRuntimeSettings,
} from "./runtime-settings.ports"

export type UpdateRuntimeSettingsCommand = Readonly<{
  body: UpdateRuntimeSettingsBody
}>

export type UpdateRuntimeSettingsSuccess = Readonly<{
  settings: RuntimeSettings
  logLevelChanged: boolean
}>

export type UpdateRuntimeSettings = (
  command: UpdateRuntimeSettingsCommand,
) => Promise<UpdateRuntimeSettingsSuccess>

export type UpdateRuntimeSettingsDeps = Readonly<{
  getSettings: GetRuntimeSettings
  saveSettings: SaveRuntimeSettings
  onLogLevelChanged?: OnLogLevelChanged
}>

const mergeRuntimeSettings = (
  previous: RuntimeSettings,
  body: UpdateRuntimeSettingsBody,
): RuntimeSettings => {
  const advertisedUrl = normalizeAdvertisedUrl(body.advertisedUrl)

  return {
    advertisedUrl: advertisedUrl === undefined ? previous.advertisedUrl : advertisedUrl,
    advertisedUrlEnabled: body.advertisedUrlEnabled ?? previous.advertisedUrlEnabled,
    bindHost: body.bindHost ?? previous.bindHost,
    bindPort: body.bindPort ?? previous.bindPort,
    logLevel: body.logLevel ?? previous.logLevel,
    logPath: body.logPath === undefined ? previous.logPath : body.logPath,
  }
}

export const makeUpdateRuntimeSettings =
  (deps: UpdateRuntimeSettingsDeps): UpdateRuntimeSettings =>
  async ({ body }) => {
    const previous = deps.getSettings()
    const next = deps.saveSettings(
      RuntimeSettingsSchema.parse(mergeRuntimeSettings(previous, body)),
    )

    const logLevelChanged = body.logLevel !== undefined && body.logLevel !== previous.logLevel
    if (logLevelChanged) {
      deps.onLogLevelChanged?.(next.logLevel)
    }

    return { settings: next, logLevelChanged }
  }
