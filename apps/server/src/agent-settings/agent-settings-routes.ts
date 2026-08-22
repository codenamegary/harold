import { FastifyInstance } from "fastify"
import {
  AgentActionBodySchema,
  AgentIdSchema,
  AgentSettings,
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  CreateCustomAgentBodySchema,
  DetectAgentPathResponseSchema,
  ImportApplyBodySchema,
  ImportDetectResponseSchema,
  UpdateAgentSettingsBodySchema,
} from "contracts/http/agent-settings"
import { AuthBroker } from "../agent/auth/broker"
import {
  AcpSupervisor,
  isAcpStartError,
} from "../acp/supervisor/models"
import { agentAdvertisesSessionList } from "../session/session.acp.ready"
import { AgentSettingsRepository } from "./agent-settings-repository"
import { wireAgentCapabilities } from "./capabilities.wire"
import {
  buildAgentCannotDeleteProblem,
  buildAgentCannotEnableProblem,
  buildAgentCannotRenameProblem,
  buildAgentCannotRespawnProblem,
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

const acpStartFailureReason = (error: unknown): string =>
  isAcpStartError(error) ? error.message : "ACP supervisor failed to start"

export const registerAgentSettingsRoutes = (
  app: FastifyInstance,
  repository: AgentSettingsRepository,
  acpSupervisor: AcpSupervisor,
  authBroker: AuthBroker,
) => {
  const toWireAgent = async (item: AgentSettings): Promise<AgentSettings> => {
    const state = acpSupervisor.getAgentRuntimeState(item.id)
    const authSummary = await authBroker.getSummary(item.id)
    return AgentSettingsSchema.parse({
      ...item,
      state,
      capabilities: wireAgentCapabilities(
        state,
        acpSupervisor.getCapabilityInventory(item.id),
      ),
      authSummary,
    })
  }

  const toWireCollection = async (items: readonly AgentSettings[]) =>
    AgentSettingsCollectionSchema.parse({
      items: await Promise.all(items.map(toWireAgent)),
    })

  app.get("/v1/settings/agents", async (_request, reply) => {
    return reply.status(200).send(await toWireCollection(repository.list()))
  })

  app.post("/v1/settings/agents", async (request, reply) => {
    CreateCustomAgentBodySchema.parse(request.body ?? {})
    const result = repository.createCustom()

    if (!result.ok) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(201).send(await toWireAgent(result.value))
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

    return reply.status(200).send(await toWireCollection(result.value))
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

  app.post("/v1/settings/agents/:agentId/actions", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const action = AgentActionBodySchema.parse(request.body)
    const settings = repository.list().find((item) => item.id === agentId)

    if (settings === undefined) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    if (!settings.enabled) {
      return sendProblem(
        reply,
        409,
        buildAgentCannotRespawnProblem("Agent is not enabled"),
      )
    }

    switch (action.type) {
      case "respawn": {
        try {
          await acpSupervisor.respawn(agentId)
        } catch (error: unknown) {
          const reason = acpStartFailureReason(error)
          app.log.warn({ agentId, reason }, "ACP agent respawn failed")
          return sendProblem(reply, 409, buildAgentCannotRespawnProblem(reason))
        }

        if (!agentAdvertisesSessionList(acpSupervisor, agentId)) {
          app.log.warn(
            { agentId, reason: "Agent does not support session/list" },
            "ACP agent respawn failed",
          )
          return sendProblem(reply, 409, buildAgentSessionListUnsupportedProblem())
        }

        const next = repository.list().find((item) => item.id === agentId)
        if (next === undefined) {
          return sendProblem(reply, 404, buildAgentNotFoundProblem())
        }

        return reply.status(200).send(await toWireAgent(next))
      }
    }
  })

  app.patch("/v1/settings/agents/:agentId", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const body = UpdateAgentSettingsBodySchema.parse(request.body)
    const result = repository.update({ agentId, body })

    if (!result.ok) {
      if (result.error.kind === "cannot_enable") {
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
      } catch (error: unknown) {
        const reason = acpStartFailureReason(error)
        app.log.warn({ agentId, reason }, "ACP agent start failed")
        repository.update({ agentId, body: { enabled: false } })
        await acpSupervisor.handleAgentDisabled(agentId)
        return sendProblem(reply, 409, buildAgentCannotEnableProblem(reason))
      }

      if (!agentAdvertisesSessionList(acpSupervisor, agentId)) {
        repository.update({ agentId, body: { enabled: false } })
        await acpSupervisor.handleAgentDisabled(agentId)
        return sendProblem(reply, 409, buildAgentSessionListUnsupportedProblem())
      }
    }

    if ("displayName" in body && result.value.id !== agentId) {
      await acpSupervisor.handleAgentDisabled(agentId)
    }

    const next = repository.list().find((item) => item.id === result.value.id)
    if (next === undefined) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(200).send(await toWireAgent(next))
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
