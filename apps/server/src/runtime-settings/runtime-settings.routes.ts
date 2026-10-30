import { FastifyInstance } from "fastify"
import { EnvBindOverrides } from "../config/env.bind.overrides"
import { AppliedRuntimeSettingsHolder } from "./applied.runtime.settings"
import { GetRuntimeSettings } from "./runtime-settings.ports"
import { buildRuntimeSettingsView } from "./resolve.runtime.settings.state"

export type RegisterRuntimeSettingsRoutesOptions = Readonly<{
  getSettings: GetRuntimeSettings
  appliedRuntimeSettings?: AppliedRuntimeSettingsHolder
  envBindOverrides?: EnvBindOverrides
}>

// Read-only. Changing runtime settings is a host operation: the CLI writes
// settings.yml directly. Nothing on the network can change the daemon's
// configuration (#458).
export const registerRuntimeSettingsRoutes = (
  app: FastifyInstance,
  options: RegisterRuntimeSettingsRoutesOptions,
) => {
  const buildApplied = () => {
    const persisted = options.getSettings()
    return (
      options.appliedRuntimeSettings?.get() ?? {
        bindPort: persisted.bindPort,
        logPath: persisted.logPath,
      }
    )
  }

  app.get("/v1/settings/runtime", async (_request, reply) => {
    const persisted = options.getSettings()
    const view = buildRuntimeSettingsView({
      persisted,
      applied: buildApplied(),
      envOverrides: options.envBindOverrides ?? {},
    })

    return reply.status(200).send(view)
  })
}
