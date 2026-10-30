import os from "node:os"
import path from "node:path"
import { z } from "zod"
import { expandHomePath } from "core/filesystem/expand.home.path"

/**
 * The daemon always serves every interface so a phone on the network can
 * pair. The bind host is not configurable: the port is the only bind knob.
 */
export const DEFAULT_BIND_HOST = "0.0.0.0"

export const ConfigSchema = z.object({
  host: z.string(),
  port: z.coerce.number().int().nonnegative(),
  dataDir: z.string().min(1),
})

export type Config = z.infer<typeof ConfigSchema>

const defaultDataDir = path.join(os.homedir(), ".harold")

const EnvSchema = z.object({
  HAROLD_PORT: z.coerce.number().int().nonnegative().default(3847),
  HAROLD_DATA_DIR: z.string().min(1).optional(),
})

export const parseConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.parse(env)
  const dataDir = expandHomePath(parsed.HAROLD_DATA_DIR ?? defaultDataDir)

  return ConfigSchema.parse({
    host: DEFAULT_BIND_HOST,
    port: parsed.HAROLD_PORT,
    dataDir,
  })
}
