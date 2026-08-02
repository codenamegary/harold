import { eq } from "drizzle-orm"
import {
  LogLevelSchema,
  normalizeAdvertisedUrl,
  RuntimeSettings,
  RuntimeSettingsSchema,
  UpdateRuntimeSettingsBody,
} from "contracts/http/runtime-settings"
import { z } from "zod"
import { AgentDatabase } from "../persistence/database"
import { runtimeSettings } from "../persistence/schema/runtime-settings"

const SINGLETON_ID = 1

const StringArraySchema = z.array(z.string())

type RuntimeSettingsRow = typeof runtimeSettings.$inferSelect

export type RuntimeSettingsUpdateResult = {
  settings: RuntimeSettings
  restartRequired: boolean
}

export type RuntimeSettingsRepository = {
  get: () => RuntimeSettings
  update: (body: UpdateRuntimeSettingsBody) => RuntimeSettingsUpdateResult
}

const nowIso = () => new Date().toISOString()

const parseJsonStringArray = (value: string): string[] =>
  StringArraySchema.parse(JSON.parse(value))

const rowToSettings = (row: RuntimeSettingsRow): RuntimeSettings =>
  RuntimeSettingsSchema.parse({
    advertisedUrl: row.advertisedUrl,
    trustedProxies: parseJsonStringArray(row.trustedProxiesJson),
    bindHost: row.bindHost,
    bindPort: row.bindPort,
    logLevel: LogLevelSchema.parse(row.logLevel),
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

export const createRuntimeSettingsRepository = (
  database: AgentDatabase,
): RuntimeSettingsRepository => {
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

  const update = (body: UpdateRuntimeSettingsBody): RuntimeSettingsUpdateResult => {
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
