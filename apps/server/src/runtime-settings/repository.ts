import {
  normalizeAdvertisedUrl,
  RuntimeSettings,
  RuntimeSettingsSchema,
  UpdateRuntimeSettingsBody,
  UpdateRuntimeSettingsResponse,
} from "contracts/http/runtime-settings"
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { ZodError } from "zod"
import { Config } from "../config/config"

export const settingsFileName = "settings.yml"

export type RuntimeSettingsSeedDefaults = {
  bindHost: "127.0.0.1"
  bindPort: number
  logLevel: RuntimeSettings["logLevel"]
  logPath: string | null
  advertisedUrl: string | null
  trustedProxies: string[]
  allowedRoots: string[]
}

export type RuntimeSettingsRepository = {
  get: () => RuntimeSettings
  update: (body: UpdateRuntimeSettingsBody) => UpdateRuntimeSettingsResponse
}

export type CreateRuntimeSettingsRepositoryOptions = {
  dataDir: string
  seedDefaults?: RuntimeSettingsSeedDefaults
}

const fallbackSeedDefaults: RuntimeSettingsSeedDefaults = {
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
  advertisedUrl: null,
  trustedProxies: [],
  allowedRoots: [],
}

const settingsPathFor = (dataDir: string): string =>
  path.join(dataDir, settingsFileName)

const formatLoadError = (params: {
  filePath: string
  cause: unknown
}): Error => {
  const { filePath, cause } = params
  if (cause instanceof ZodError) {
    return new Error(
      `Invalid settings.yml at ${filePath}: schema validation failed`,
      { cause },
    )
  }
  if (cause instanceof Error) {
    return new Error(`Invalid settings.yml at ${filePath}: ${cause.message}`, {
      cause,
    })
  }
  return new Error(`Invalid settings.yml at ${filePath}`)
}

const parseSettingsDocument = (params: {
  filePath: string
  raw: string
}): RuntimeSettings => {
  const { filePath, raw } = params
  const parsed: unknown = (() => {
    try {
      return YAML.parse(raw)
    } catch (cause: unknown) {
      throw formatLoadError({ filePath, cause })
    }
  })()

  try {
    return RuntimeSettingsSchema.parse(parsed)
  } catch (cause: unknown) {
    throw formatLoadError({ filePath, cause })
  }
}

const serializeSettings = (settings: RuntimeSettings): string =>
  YAML.stringify(settings)

const writeSettingsAtomic = (params: {
  filePath: string
  settings: RuntimeSettings
}) => {
  const { filePath, settings } = params
  const content = serializeSettings(settings)
  const tempPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(tempPath, content, "utf8")
  renameSync(tempPath, filePath)
}

const requiresRestart = (params: {
  current: RuntimeSettings
  next: RuntimeSettings
}): boolean => {
  const { current, next } = params
  return (
    current.bindHost !== next.bindHost ||
    current.bindPort !== next.bindPort ||
    current.logPath !== next.logPath
  )
}

const loadOrSeed = (params: {
  filePath: string
  seedDefaults: RuntimeSettingsSeedDefaults
}): RuntimeSettings => {
  const { filePath, seedDefaults } = params

  if (!existsSync(filePath)) {
    const seeded = RuntimeSettingsSchema.parse(seedDefaults)
    writeSettingsAtomic({ filePath, settings: seeded })
    return seeded
  }

  const raw = readFileSync(filePath, "utf8")
  return parseSettingsDocument({ filePath, raw })
}

export const createRuntimeSettingsRepository = (
  options: CreateRuntimeSettingsRepositoryOptions,
): RuntimeSettingsRepository => {
  const seedDefaults = options.seedDefaults ?? fallbackSeedDefaults
  const filePath = settingsPathFor(options.dataDir)
  const cache: { settings: RuntimeSettings } = {
    settings: loadOrSeed({ filePath, seedDefaults }),
  }

  const get = (): RuntimeSettings => cache.settings

  const update = (
    body: UpdateRuntimeSettingsBody,
  ): UpdateRuntimeSettingsResponse => {
    const current = get()
    const advertisedUrl = normalizeAdvertisedUrl(body.advertisedUrl)

    const next = RuntimeSettingsSchema.parse({
      advertisedUrl:
        advertisedUrl === undefined ? current.advertisedUrl : advertisedUrl,
      trustedProxies: body.trustedProxies ?? current.trustedProxies,
      bindHost: body.bindHost ?? current.bindHost,
      bindPort: body.bindPort ?? current.bindPort,
      logLevel: body.logLevel ?? current.logLevel,
      logPath: body.logPath === undefined ? current.logPath : body.logPath,
      allowedRoots: body.allowedRoots ?? current.allowedRoots,
    })

    writeSettingsAtomic({ filePath, settings: next })
    cache.settings = next

    return {
      settings: next,
      restartRequired: requiresRestart({ current, next }),
    }
  }

  return {
    get,
    update,
  }
}

export const seedDefaultsFromConfig = (
  config: Config,
): RuntimeSettingsSeedDefaults => ({
  bindHost: config.host,
  bindPort: config.port,
  logLevel: "info",
  logPath: null,
  advertisedUrl: null,
  trustedProxies: [],
  allowedRoots: [],
})
