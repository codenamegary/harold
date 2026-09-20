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
import { AcpSupervisor } from "../acp/supervisor/models"
import { agentAdvertisesSessionList } from "../session/session.acp.ready"
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
} from "./agent.settings.problems"
import { ApplyImportedAgents } from "./agent.settings.import.apply.usecase"
import { CreateCustomAgent } from "./agent.settings.create.custom.usecase"
import { DetectAgentPath } from "./agent.settings.detect.path.usecase"
import { DetectImportableAgents } from "./agent.settings.import.detect.usecase"
import { ListAgentSettings } from "./agent.settings.list.usecase"
import { RemoveAgent } from "./agent.settings.remove.usecase"
import { UpdateAgentSettings } from "./agent.settings.update.usecase"

export type RegisterAgentSettingsRoutesOptions = Readonly<{
  list: ListAgentSettings
  createCustomAgent: CreateCustomAgent
  detectImportableAgents: DetectImportableAgents
  applyImportedAgents: ApplyImportedAgents
  detectAgentPath: DetectAgentPath
  updateAgentSettings: UpdateAgentSettings
  removeAgent: RemoveAgent
  acpSupervisor: AcpSupervisor
  authBroker: AuthBroker
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

export const registerAgentSettingsRoutes = (
  app: FastifyInstance,
  options: RegisterAgentSettingsRoutesOptions,
) => {
  const { acpSupervisor, authBroker } = options

  const toWireAgent = async (item: AgentSettings): Promise<AgentSettings> => {
    const state = acpSupervisor.getAgentRuntimeState(item.id)
    const authSummary = await authBroker.getSummary(item.id)
    return AgentSettingsSchema.parse({
      ...item,
      state,
      capabilities: wireAgentCapabilities(state, acpSupervisor.getCapabilityInventory(item.id)),
      authSummary,
    })
  }

  const toWireCollection = async (items: readonly AgentSettings[]) => {
    const enabledIds = items.filter((item) => item.enabled).map((item) => item.id)
    await authBroker.probeEnabledAgents(enabledIds)
    return AgentSettingsCollectionSchema.parse({
      items: await Promise.all(items.map(toWireAgent)),
    })
  }

  app.get("/v1/settings/agents", async (_request, reply) => {
    return reply.status(200).send(await toWireCollection(options.list()))
  })

  app.post("/v1/settings/agents", async (request, reply) => {
    CreateCustomAgentBodySchema.parse(request.body ?? {})
    const result = options.createCustomAgent()

    if (!result.ok) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(201).send(await toWireAgent(result.value))
  })

  app.post("/v1/settings/agents/import/detect", async (_request, reply) => {
    const result = await options.detectImportableAgents()

    if (!result.ok) {
      return sendProblem(reply, 502, buildAgentRegistryFetchFailedProblem())
    }

    return reply.status(200).send(ImportDetectResponseSchema.parse(result.value))
  })

  app.post("/v1/settings/agents/import/apply", async (request, reply) => {
    const body = ImportApplyBodySchema.parse(request.body)
    const result = options.applyImportedAgents(body)

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
    const result = options.detectAgentPath(agentId)

    if (!result.ok) {
      if (result.error.kind === "path_not_found") {
        return sendProblem(reply, 404, buildAgentPathNotFoundProblem())
      }
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(200).send(DetectAgentPathResponseSchema.parse(result.value))
  })

  app.post("/v1/settings/agents/:agentId/actions", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const action = AgentActionBodySchema.parse(request.body)
    const settings = options.list().find((item) => item.id === agentId)

    if (settings === undefined) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    if (!settings.enabled) {
      return sendProblem(reply, 409, buildAgentCannotRespawnProblem("Agent is not enabled"))
    }

    switch (action.type) {
      case "respawn": {
        const startResult = await acpSupervisor.respawn(agentId)
        if (!startResult.ok) {
          app.log.warn({ agentId, reason: startResult.reason }, "ACP agent respawn failed")
          return sendProblem(reply, 409, buildAgentCannotRespawnProblem(startResult.reason))
        }

        if (!agentAdvertisesSessionList(acpSupervisor, agentId)) {
          app.log.warn(
            { agentId, reason: "Agent does not support session/list" },
            "ACP agent respawn failed",
          )
          return sendProblem(reply, 409, buildAgentSessionListUnsupportedProblem())
        }

        const next = options.list().find((item) => item.id === agentId)
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
    const result = options.updateAgentSettings({ agentId, body })

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
      const startResult = await acpSupervisor.start(agentId)
      if (!startResult.ok) {
        app.log.warn({ agentId, reason: startResult.reason }, "ACP agent start failed")
        options.updateAgentSettings({ agentId, body: { enabled: false } })
        await acpSupervisor.handleAgentDisabled(agentId)
        return sendProblem(reply, 409, buildAgentCannotEnableProblem(startResult.reason))
      }

      if (!agentAdvertisesSessionList(acpSupervisor, agentId)) {
        options.updateAgentSettings({ agentId, body: { enabled: false } })
        await acpSupervisor.handleAgentDisabled(agentId)
        return sendProblem(reply, 409, buildAgentSessionListUnsupportedProblem())
      }
    }

    if ("displayName" in body && result.value.id !== agentId) {
      await acpSupervisor.handleAgentDisabled(agentId)
    }

    const next = options.list().find((item) => item.id === result.value.id)
    if (next === undefined) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(200).send(await toWireAgent(next))
  })

  app.delete("/v1/settings/agents/:agentId", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const result = options.removeAgent(agentId)

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
