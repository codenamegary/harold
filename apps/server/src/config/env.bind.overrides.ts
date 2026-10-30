import { z } from "zod"

const EnvBindPortSchema = z.coerce.number().int().nonnegative().max(65535)

export type EnvBindOverrides = {
  bindPort?: number
}

export const readEnvBindOverrides = (env: Record<string, string | undefined>): EnvBindOverrides => {
  const overrides: EnvBindOverrides = {}

  if (env.HAROLD_PORT !== undefined) {
    overrides.bindPort = EnvBindPortSchema.parse(env.HAROLD_PORT)
  }

  return overrides
}
