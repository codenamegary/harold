import { z } from "zod"
import { BindHost, BindHostSchema } from "contracts/http/runtime-settings"

const EnvBindPortSchema = z.coerce.number().int().nonnegative().max(65535)

export type EnvBindOverrides = {
  bindHost?: BindHost
  bindPort?: number
}

export const readEnvBindOverrides = (env: Record<string, string | undefined>): EnvBindOverrides => {
  const overrides: EnvBindOverrides = {}

  if (env.HAROLD_HOST !== undefined) {
    overrides.bindHost = BindHostSchema.parse(env.HAROLD_HOST)
  }

  if (env.HAROLD_PORT !== undefined) {
    overrides.bindPort = EnvBindPortSchema.parse(env.HAROLD_PORT)
  }

  return overrides
}
