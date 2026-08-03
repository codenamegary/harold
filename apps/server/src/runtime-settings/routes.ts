import {
  LogLevel,
  RuntimeSettingsSchema,
  UpdateRuntimeSettingsBodySchema,
  UpdateRuntimeSettingsResponseSchema,
} from "contracts/http/runtime-settings"
import { FastifyInstance } from "fastify"
import { RuntimeSettingsRepository } from "./repository"

export type RegisterRuntimeSettingsRoutesOptions = {
  onLogLevelChanged?: (logLevel: LogLevel) => void
}

export const registerRuntimeSettingsRoutes = (
  app: FastifyInstance,
  repository: RuntimeSettingsRepository,
  options: RegisterRuntimeSettingsRoutesOptions = {},
) => {
  app.get("/v1/settings/runtime", async (_request, reply) => {
    const settings = RuntimeSettingsSchema.parse(repository.get())
    return reply.status(200).send(settings)
  })

  app.patch("/v1/settings/runtime", async (request, reply) => {
    const body = UpdateRuntimeSettingsBodySchema.parse(request.body)
    const previous = repository.get()
    const result = repository.update(body)

    if (
      body.logLevel !== undefined &&
      body.logLevel !== previous.logLevel &&
      options.onLogLevelChanged
    ) {
      options.onLogLevelChanged(result.settings.logLevel)
    }

    return reply.status(200).send(
      UpdateRuntimeSettingsResponseSchema.parse(result),
    )
  })
}
