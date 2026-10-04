import os from "node:os"
import path from "node:path"
import { z } from "zod"
import { expandHomePath } from "core/filesystem/expand.home.path"

export const ConfigSchema = z.object({
  host: z.literal("127.0.0.1"),
  port: z.coerce.number().int().nonnegative(),
  dataDir: z.string().min(1),
})

export type Config = z.infer<typeof ConfigSchema>

const defaultDataDir = path.join(os.homedir(), ".harold")

const EnvSchema = z.object({
  HAROLD_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  HAROLD_PORT: z.coerce.number().int().nonnegative().default(3847),
  HAROLD_DATA_DIR: z.string().min(1).optional(),
})

export const parseConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.parse(env)
  const dataDir = expandHomePath(parsed.HAROLD_DATA_DIR ?? defaultDataDir)

  return ConfigSchema.parse({
    host: parsed.HAROLD_HOST,
    port: parsed.HAROLD_PORT,
    dataDir,
  })
}
