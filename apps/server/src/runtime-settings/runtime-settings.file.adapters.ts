import { RuntimeSettings, RuntimeSettingsSchema } from "contracts/http/runtime-settings"
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { ZodError } from "zod"
import { Config } from "../config/config"
import { GetRuntimeSettings, SaveRuntimeSettings } from "./runtime-settings.ports"

export const settingsFileName = "settings.yml"

export type RuntimeSettingsFileStore = Readonly<{
  get: GetRuntimeSettings
  save: SaveRuntimeSettings
}>

export type MakeRuntimeSettingsFileStoreOptions = {
  dataDir: string
  seedDefaults?: RuntimeSettings
}

const fallbackSeedDefaults: RuntimeSettings = RuntimeSettingsSchema.parse({
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
})

const settingsPathFor = (dataDir: string): string => path.join(dataDir, settingsFileName)

const formatLoadError = (params: { filePath: string; cause: unknown }): Error => {
  const { filePath, cause } = params
  if (cause instanceof ZodError) {
    return new Error(`Invalid settings.yml at ${filePath}: schema validation failed`, { cause })
  }
  if (cause instanceof Error) {
    return new Error(`Invalid settings.yml at ${filePath}: ${cause.message}`, {
      cause,
    })
  }
  return new Error(`Invalid settings.yml at ${filePath}`)
}

// Retired keys from older settings.yml files are stripped before validating so
// an existing install keeps booting: `trustedProxies` and the advertised and
// bind-host settings all left the schema when the daemon moved to a static
// wildcard bind with a derived, remembered pairing endpoint (#458).
const retiredKeys = ["trustedProxies", "bindHost", "advertisedUrl", "advertisedUrlEnabled"] as const

const stripRetiredKeys = (value: unknown): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value
  }
  const rest = { ...(value as Record<string, unknown>) }
  for (const key of retiredKeys) {
    delete rest[key]
  }
  return rest
}

const parseSettingsDocument = (params: { filePath: string; raw: string }): RuntimeSettings => {
  const { filePath, raw } = params
  const parsed: unknown = (() => {
    try {
      return YAML.parse(raw)
    } catch (cause: unknown) {
      throw formatLoadError({ filePath, cause })
    }
  })()

  try {
    return RuntimeSettingsSchema.parse(stripRetiredKeys(parsed))
  } catch (cause: unknown) {
    throw formatLoadError({ filePath, cause })
  }
}

const serializeSettings = (settings: RuntimeSettings): string => YAML.stringify(settings)

const writeSettingsAtomic = (params: { filePath: string; settings: RuntimeSettings }) => {
  const { filePath, settings } = params
  const content = serializeSettings(settings)
  const tempPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(tempPath, content, "utf8")
  renameSync(tempPath, filePath)
}

const loadOrSeed = (params: {
  filePath: string
  seedDefaults: RuntimeSettings
}): RuntimeSettings => {
  const { filePath, seedDefaults } = params

  if (!existsSync(filePath)) {
    writeSettingsAtomic({ filePath, settings: seedDefaults })
    return seedDefaults
  }

  const raw = readFileSync(filePath, "utf8")
  return parseSettingsDocument({ filePath, raw })
}

export const makeRuntimeSettingsFileStore = (
  options: MakeRuntimeSettingsFileStoreOptions,
): RuntimeSettingsFileStore => {
  const seedDefaults = options.seedDefaults ?? fallbackSeedDefaults
  const filePath = settingsPathFor(options.dataDir)
  const cache: { settings: RuntimeSettings } = {
    settings: loadOrSeed({ filePath, seedDefaults }),
  }

  const get: GetRuntimeSettings = () => cache.settings

  const save: SaveRuntimeSettings = (next) => {
    writeSettingsAtomic({ filePath, settings: next })
    cache.settings = next

    return next
  }

  return {
    get,
    save,
  }
}

export const seedDefaultsFromConfig = (config: Config): RuntimeSettings =>
  RuntimeSettingsSchema.parse({
    bindPort: config.port,
    logLevel: "info",
    // null selects the default log file under the data dir, not stdout.
    logPath: null,
  })
