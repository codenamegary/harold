import {
  AgentIdSchema,
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  CreateCustomAgentBodySchema,
  DetectAgentPathResponseSchema,
  ImportApplyBodySchema,
  ImportDetectResponseSchema,
  UpdateAgentSettingsBodySchema,
} from "contracts/http/agent-settings"
import { FastifyInstance } from "fastify"
import { agentSupportsSessionList } from "../acp/catalog/session.list.support"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { AgentSettingsRepository } from "./agent-settings-repository"
import {
  buildAgentCannotDeleteProblem,
  buildAgentCannotEnableProblem,
  buildAgentCannotRenameProblem,
  buildAgentIdConflictProblem,
  buildAgentNotFoundProblem,
  buildAgentPathAutoDetectFailedProblem,
  buildAgentPathInvalidProblem,
  buildAgentPathNotFoundProblem,
  buildAgentRegistryFetchFailedProblem,
  buildAgentSessionListUnsupportedProblem,
} from "./agent-settings-problems"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerAgentSettingsRoutes = (
  app: FastifyInstance,
  repository: AgentSettingsRepository,
  acpSupervisor: AcpSupervisor,
) => {
  app.get("/v1/settings/agents", async (_request, reply) => {
    const collection = AgentSettingsCollectionSchema.parse({
      items: repository.list(),
    })

    return reply.status(200).send(collection)
  })

  app.post("/v1/settings/agents", async (request, reply) => {
    CreateCustomAgentBodySchema.parse(request.body ?? {})
    const result = repository.createCustom()

    if (!result.ok) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(201).send(AgentSettingsSchema.parse(result.value))
  })

  app.post("/v1/settings/agents/import/detect", async (_request, reply) => {
    const result = await repository.importDetect()

    if (!result.ok) {
      return sendProblem(reply, 502, buildAgentRegistryFetchFailedProblem())
    }

    return reply.status(200).send(ImportDetectResponseSchema.parse(result.value))
  })

  app.post("/v1/settings/agents/import/apply", async (request, reply) => {
    const body = ImportApplyBodySchema.parse(request.body)
    const result = repository.importApply(body)

    if (!result.ok) {
      if (result.error.kind === "path_invalid") {
        return sendProblem(reply, 400, buildAgentPathInvalidProblem(result.error.path))
      }
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(200).send(
      AgentSettingsCollectionSchema.parse({
        items: result.value,
      }),
    )
  })

  app.post("/v1/settings/agents/:agentId/detect-path", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const result = repository.detectPath(agentId)

    if (!result.ok) {
      if (result.error.kind === "path_not_found") {
        return sendProblem(reply, 404, buildAgentPathNotFoundProblem())
      }
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(200).send(
      DetectAgentPathResponseSchema.parse(result.value),
    )
  })

  app.patch("/v1/settings/agents/:agentId", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const body = UpdateAgentSettingsBodySchema.parse(request.body)
    const result = repository.update({ agentId, body })

    if (!result.ok) {
      if (result.error.kind === "cannot_enable") {
        if (!agentSupportsSessionList(agentId)) {
          return sendProblem(reply, 409, buildAgentSessionListUnsupportedProblem())
        }
        return sendProblem(reply, 409, buildAgentCannotEnableProblem())
      }
      if (result.error.kind === "cannot_rename") {
        return sendProblem(reply, 409, buildAgentCannotRenameProblem())
      }
      if (result.error.kind === "id_conflict") {
        return sendProblem(reply, 409, buildAgentIdConflictProblem())
      }
      if (result.error.kind === "path_not_found") {
        return sendProblem(reply, 404, buildAgentPathNotFoundProblem())
      }
      if (result.error.kind === "path_auto_detect_failed") {
        return sendProblem(reply, 400, buildAgentPathAutoDetectFailedProblem())
      }
      if (result.error.kind === "path_invalid") {
        return sendProblem(reply, 400, buildAgentPathInvalidProblem(result.error.path))
      }
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    if ("enabled" in body && !body.enabled) {
      await acpSupervisor.handleAgentDisabled(agentId)
    }

    if ("enabled" in body && body.enabled) {
      try {
        await acpSupervisor.start(agentId)
      } catch {
        repository.update({ agentId, body: { enabled: false } })
        await acpSupervisor.handleAgentDisabled(agentId)
        return sendProblem(reply, 409, buildAgentCannotEnableProblem("ACP supervisor failed to start"))
      }

      if (!acpSupervisor.getAgentCapabilities(agentId)?.sessionCapabilities.list) {
        repository.update({ agentId, body: { enabled: false } })
        await acpSupervisor.handleAgentDisabled(agentId)
        return sendProblem(reply, 409, buildAgentSessionListUnsupportedProblem())
      }
    }

    if ("displayName" in body && result.value.id !== agentId) {
      await acpSupervisor.handleAgentDisabled(agentId)
    }

    return reply.status(200).send(AgentSettingsSchema.parse(result.value))
  })

  app.delete("/v1/settings/agents/:agentId", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const result = repository.remove(agentId)

    if (!result.ok) {
      if (result.error.kind === "cannot_delete") {
        return sendProblem(reply, 409, buildAgentCannotDeleteProblem())
      }
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    await acpSupervisor.handleAgentDisabled(agentId)

    return reply.status(204).send()
  })
}
