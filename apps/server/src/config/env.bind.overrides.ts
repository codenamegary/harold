import { z } from "zod"

const EnvBindHostSchema = z.literal("127.0.0.1")

const EnvBindPortSchema = z.coerce.number().int().nonnegative().max(65535)

export type EnvBindOverrides = {
  bindHost?: "127.0.0.1"
  bindPort?: number
}

export const readEnvBindOverrides = (
  env: Record<string, string | undefined>,
): EnvBindOverrides => {
  const overrides: EnvBindOverrides = {}

  if (env.AGENT_SERVER_HOST !== undefined) {
    overrides.bindHost = EnvBindHostSchema.parse(env.AGENT_SERVER_HOST)
  }

  if (env.AGENT_SERVER_PORT !== undefined) {
    overrides.bindPort = EnvBindPortSchema.parse(env.AGENT_SERVER_PORT)
  }

  return overrides
}
