import { z } from "zod"

export const ConfigSchema = z.object({
  host: z.literal("127.0.0.1"),
  port: z.coerce.number().int().nonnegative(),
})

export type Config = z.infer<typeof ConfigSchema>

const EnvSchema = z.object({
  AGENT_SERVER_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  AGENT_SERVER_PORT: z.coerce.number().int().nonnegative().default(3847),
})

export const parseConfig = (env: Record<string, string | undefined>): Config => {
  const parsed = EnvSchema.parse(env)

  return ConfigSchema.parse({
    host: parsed.AGENT_SERVER_HOST,
    port: parsed.AGENT_SERVER_PORT,
  })
}
