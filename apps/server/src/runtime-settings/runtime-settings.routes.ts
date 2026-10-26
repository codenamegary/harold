import { UpdateRuntimeSettingsBodySchema } from "contracts/http/runtime-settings"
import { FastifyInstance } from "fastify"
import { EnvBindOverrides } from "../config/env.bind.overrides"
import { AppliedRuntimeSettingsHolder } from "./applied.runtime.settings"
import { GetRuntimeSettings } from "./runtime-settings.ports"
import { UpdateRuntimeSettings } from "./runtime-settings.update.usecase"
import { buildRuntimeSettingsView } from "./resolve.runtime.settings.state"

export type RegisterRuntimeSettingsRoutesOptions = Readonly<{
  getSettings: GetRuntimeSettings
  updateRuntimeSettings: UpdateRuntimeSettings
  appliedRuntimeSettings?: AppliedRuntimeSettingsHolder
  envBindOverrides?: EnvBindOverrides
}>

export const registerRuntimeSettingsRoutes = (
  app: FastifyInstance,
  options: RegisterRuntimeSettingsRoutesOptions,
) => {
  const buildApplied = () => {
    const persisted = options.getSettings()
    return (
      options.appliedRuntimeSettings?.get() ?? {
        bindHost: persisted.bindHost,
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

  app.patch("/v1/settings/runtime", async (request, reply) => {
    const body = UpdateRuntimeSettingsBodySchema.parse(request.body)
    const result = await options.updateRuntimeSettings({ body })

    const view = buildRuntimeSettingsView({
      persisted: result.settings,
      applied: buildApplied(),
      envOverrides: options.envBindOverrides ?? {},
    })

    return reply.status(200).send(view)
  })
}
