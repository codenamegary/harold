import { eq } from "drizzle-orm"
import {
  normalizeAdvertisedUrl,
  RuntimeSettings,
  RuntimeSettingsSchema,
  UpdateRuntimeSettingsBody,
  UpdateRuntimeSettingsResponse,
} from "contracts/http/runtime-settings"
import { z } from "zod"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/database"
import { runtimeSettings } from "../persistence/schema/runtime-settings"

const SINGLETON_ID = 1

const StringArraySchema = z.array(z.string())

type RuntimeSettingsRow = typeof runtimeSettings.$inferSelect

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
  seedDefaults?: RuntimeSettingsSeedDefaults
}

const nowIso = () => new Date().toISOString()

const defaultSeedFromConfig = (config: Config): RuntimeSettingsSeedDefaults => ({
  bindHost: config.host,
  bindPort: config.port,
  logLevel: "info",
  logPath: null,
  advertisedUrl: null,
  trustedProxies: [],
  allowedRoots: [],
})

const fallbackSeedDefaults: RuntimeSettingsSeedDefaults = {
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
  advertisedUrl: null,
  trustedProxies: [],
  allowedRoots: [],
}

const parseJsonStringArray = (value: string): string[] => {
  const parsed: unknown = (() => {
    try {
      return JSON.parse(value)
    } catch {
      throw new Error("runtime_settings JSON column is not valid JSON")
    }
  })()
  return StringArraySchema.parse(parsed)
}

const rowToSettings = (row: RuntimeSettingsRow): RuntimeSettings =>
  RuntimeSettingsSchema.parse({
    advertisedUrl: row.advertisedUrl,
    trustedProxies: parseJsonStringArray(row.trustedProxiesJson),
    bindHost: row.bindHost,
    bindPort: row.bindPort,
    logLevel: row.logLevel,
    logPath: row.logPath,
    allowedRoots: parseJsonStringArray(row.allowedRootsJson),
  })

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

const ensureSeeded = (
  database: AgentDatabase,
  seedDefaults: RuntimeSettingsSeedDefaults,
) => {
  const existing = database.db
    .select()
    .from(runtimeSettings)
    .where(eq(runtimeSettings.id, SINGLETON_ID))
    .get()

  if (existing) {
    return
  }

  const seeded = RuntimeSettingsSchema.parse(seedDefaults)

  database.db
    .insert(runtimeSettings)
    .values({
      id: SINGLETON_ID,
      advertisedUrl: seeded.advertisedUrl,
      trustedProxiesJson: JSON.stringify(seeded.trustedProxies),
      bindHost: seeded.bindHost,
      bindPort: seeded.bindPort,
      logLevel: seeded.logLevel,
      logPath: seeded.logPath,
      allowedRootsJson: JSON.stringify(seeded.allowedRoots),
      updatedAt: nowIso(),
    })
    .run()
}

export const createRuntimeSettingsRepository = (
  database: AgentDatabase,
  options: CreateRuntimeSettingsRepositoryOptions = {},
): RuntimeSettingsRepository => {
  const seedDefaults = options.seedDefaults ?? fallbackSeedDefaults
  ensureSeeded(database, seedDefaults)

  const get = (): RuntimeSettings => {
    const row = database.db
      .select()
      .from(runtimeSettings)
      .where(eq(runtimeSettings.id, SINGLETON_ID))
      .get()

    if (!row) {
      throw new Error("runtime_settings singleton row is missing")
    }

    return rowToSettings(row)
  }

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

    database.db
      .update(runtimeSettings)
      .set({
        advertisedUrl: next.advertisedUrl,
        trustedProxiesJson: JSON.stringify(next.trustedProxies),
        bindHost: next.bindHost,
        bindPort: next.bindPort,
        logLevel: next.logLevel,
        logPath: next.logPath,
        allowedRootsJson: JSON.stringify(next.allowedRoots),
        updatedAt: nowIso(),
      })
      .where(eq(runtimeSettings.id, SINGLETON_ID))
      .run()

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

export const seedDefaultsFromConfig = defaultSeedFromConfig
