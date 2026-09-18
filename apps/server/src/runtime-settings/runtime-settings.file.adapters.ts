import {
  RuntimeSettings,
  RuntimeSettingsSchema,
} from "contracts/http/runtime-settings"
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
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
  advertisedUrl: null,
  advertisedUrlEnabled: true,
  trustedProxies: [],
  allowedRoots: [],
})

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
    bindHost: config.host,
    bindPort: config.port,
    logLevel: "info",
    logPath: null,
    advertisedUrl: null,
    advertisedUrlEnabled: true,
    trustedProxies: [],
    allowedRoots: [],
  })
