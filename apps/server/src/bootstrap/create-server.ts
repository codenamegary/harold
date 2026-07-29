import Fastify, { FastifyInstance } from "fastify"
import { z } from "zod"
import { registerErrorHandler } from "../error/error-handler"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/open-database"
import { Runtime } from "../runtime/runtime"
import { registerStatusRoutes } from "../status/status-routes"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { registerAgentSettingsRoutes } from "../agent-settings/agent-settings-routes"
import { createWorkspaceRepository } from "../workspace/workspace-repository"
import { registerWorkspaceRoutes } from "../workspace/workspace-routes"
import { createSessionRepository } from "../session/session-repository"
import { registerSessionRoutes } from "../session/session-routes"
import { createWorkspaceService } from "../workspace/workspace-service"
import { createSessionService } from "../session/session-service"
import { createEventJournalRepository } from "../event/event-journal-repository"
import { createEventCommitPublisher } from "../event/event-commit-publisher"
import { createRuntimeStatusService } from "../runtime/runtime-status-service"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { createAcpSupervisor } from "../acp/supervisor/acp-supervisor"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { SpawnAgentProcessFn } from "../acp/supervisor/spawn-agent-process"

const TestBodySchema = z.object({
  name: z.string().min(1),
})

export const registerTestRoutes = (app: FastifyInstance) => {
  app.post("/v1/_test/validate", async (request) => {
    TestBodySchema.parse(request.body)
    return { ok: true }
  })

  app.get("/v1/_test/error", async () => {
    throw new Error("Test internal error")
  })
}

export type CreateServerOptions = {
  config: Config
  runtime: Runtime
  database: AgentDatabase
  registerTestRoutes?: boolean
  whichFn?: WhichFn
  validateExecutablePathFn?: ValidateExecutablePathFn
  acpSupervisor?: AcpSupervisor
  spawnAgentProcessFn?: SpawnAgentProcessFn
}

export const createServer = async ({
  config,
  runtime,
  database,
  registerTestRoutes: withTestRoutes = false,
  whichFn,
  validateExecutablePathFn,
  acpSupervisor: providedAcpSupervisor,
  spawnAgentProcessFn,
}: CreateServerOptions) => {
  const app = Fastify({
    logger: {
      level: "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-api-key']",
        ],
        remove: true,
      },
    },
  })

  registerErrorHandler(app)
  const agentSettingsRepository = createAgentSettingsRepository(database, {
    whichFn,
    validateExecutablePathFn,
  })
  const acpSupervisor =
    providedAcpSupervisor ??
    createAcpSupervisor({
      agentSettingsRepository,
      serverVersion: runtime.version,
      spawnAgentProcessFn,
    })

  registerStatusRoutes(app, runtime, config, acpSupervisor)
  const eventJournal = createEventJournalRepository(database)
  const commitPublisher = createEventCommitPublisher()
  const workspaceRepository = createWorkspaceRepository(database)
  const sessionRepository = createSessionRepository(database)
  const workspaceService = createWorkspaceService({
    database,
    workspaceRepository,
    eventJournal,
    commitPublisher,
  })
  const sessionService = createSessionService({
    database,
    sessionRepository,
    eventJournal,
    commitPublisher,
  })
  const runtimeStatusService = createRuntimeStatusService({
    database,
    runtime,
    eventJournal,
    commitPublisher,
  })
  runtimeStatusService.persistStarting()

  registerWorkspaceRoutes(
    app,
    workspaceRepository,
    workspaceService,
    sessionRepository,
    acpSupervisor,
  )
  registerAgentSettingsRoutes(app, agentSettingsRepository, acpSupervisor)
  registerSessionRoutes(
    app,
    sessionRepository,
    sessionService,
    workspaceRepository,
    agentSettingsRepository,
    acpSupervisor,
  )

  if (withTestRoutes) {
    registerTestRoutes(app)
  }

  return { app, acpSupervisor, eventJournal, commitPublisher, runtimeStatusService }
}
