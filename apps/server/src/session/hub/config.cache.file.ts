import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { SessionConfigSchema } from "contracts/http/config.options"
import { z } from "zod"
import { ConfigOptionsSnapshot, CreateConfigOptionsCacheParams } from "./config.cache"

const CACHE_VERSION = 1

const CacheFileSchema = z.strictObject({
  version: z.literal(CACHE_VERSION),
  sessions: z.record(z.string(), SessionConfigSchema),
})

const readSnapshot = (filePath: string): ConfigOptionsSnapshot => {
  try {
    if (!existsSync(filePath)) {
      return {}
    }
    const parsed = CacheFileSchema.safeParse(JSON.parse(readFileSync(filePath, "utf8")))
    return parsed.success ? parsed.data.sessions : {}
  } catch {
    return {}
  }
}

/**
 * File-backed config snapshot for the daemon data dir. Survives a daemon
 * restart so a session that already advertised its options can still send
 * them before a full replay. Writes are best effort and never break a stream.
 */
export const createConfigOptionsFileCache = (
  filePath: string,
): Required<CreateConfigOptionsCacheParams> => ({
  initial: readSnapshot(filePath),
  onChange: (snapshot) => {
    try {
      mkdirSync(path.dirname(filePath), { recursive: true })
      const temporaryPath = `${filePath}.tmp`
      writeFileSync(
        temporaryPath,
        JSON.stringify({ version: CACHE_VERSION, sessions: snapshot }),
        "utf8",
      )
      renameSync(temporaryPath, filePath)
    } catch {
      // A read-only data dir or a full disk must not fail a live stream.
    }
  },
})
