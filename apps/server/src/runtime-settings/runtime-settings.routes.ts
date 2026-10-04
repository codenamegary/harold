import {
  PatchRuntimeSettingsQuerySchema,
  UpdateRuntimeSettingsBodySchema,
} from "contracts/http/runtime-settings"
import { FastifyInstance } from "fastify"
import { EnvBindOverrides } from "../config/env.bind.overrides"
import { AppliedRuntimeSettingsHolder } from "./applied.runtime.settings"
import {
  buildAllowedRootHasWorkspacesProblem,
  buildAllowedRootValidationProblem,
} from "./runtime.settings.problems"
import { GetRuntimeSettings } from "./runtime-settings.ports"
import { UpdateRuntimeSettings } from "./runtime-settings.update.usecase"
import { buildRuntimeSettingsView } from "./resolve.runtime.settings.state"

export type RegisterRuntimeSettingsRoutesOptions = Readonly<{
  getSettings: GetRuntimeSettings
  updateRuntimeSettings: UpdateRuntimeSettings
  appliedRuntimeSettings?: AppliedRuntimeSettingsHolder
  envBindOverrides?: EnvBindOverrides
}>

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

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
    const query = PatchRuntimeSettingsQuerySchema.parse(request.query)
    const body = UpdateRuntimeSettingsBodySchema.parse(request.body)

    const result = await options.updateRuntimeSettings({
      body,
      force: query.force ?? false,
    })

    if (!result.ok) {
      switch (result.error.kind) {
        case "invalid_allowed_root":
          return sendProblem(
            reply,
            400,
            buildAllowedRootValidationProblem({
              error: result.error.error,
              index: result.error.index,
            }),
          )
        case "allowed_root_has_workspaces":
          return sendProblem(reply, 409, buildAllowedRootHasWorkspacesProblem(result.error.detail))
        case "workspace_not_found":
          return sendProblem(reply, 404, {
            type: "https://harold.local/problems/not-found",
            title: "Workspace not found",
            status: 404,
            detail: "Unknown workspace id",
          })
      }
    }

    const view = buildRuntimeSettingsView({
      persisted: result.value.settings,
      applied: buildApplied(),
      envOverrides: options.envBindOverrides ?? {},
    })

    return reply.status(200).send(view)
  })
}
