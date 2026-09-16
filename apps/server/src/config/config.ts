import os from "node:os"
import path from "node:path"
import { z } from "zod"
import { expandHomePath } from "../filesystem/filesystem.expand.home.path"

export const ConfigSchema = z.object({
  host: z.literal("127.0.0.1"),
  port: z.coerce.number().int().nonnegative(),
  dataDir: z.string().min(1),
})

export type Config = z.infer<typeof ConfigSchema>

const defaultDataDir = path.join(os.homedir(), ".agent-server")

const EnvSchema = z.object({
  AGENT_SERVER_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  AGENT_SERVER_PORT: z.coerce.number().int().nonnegative().default(3847),
  AGENT_SERVER_DATA_DIR: z.string().min(1).optional(),
})

export const parseConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.parse(env)
  const dataDir = expandHomePath(parsed.AGENT_SERVER_DATA_DIR ?? defaultDataDir)

  return ConfigSchema.parse({
    host: parsed.AGENT_SERVER_HOST,
    port: parsed.AGENT_SERVER_PORT,
    dataDir,
  })
}
