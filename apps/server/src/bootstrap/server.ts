import Fastify, { FastifyInstance } from "fastify"
import websocket from "@fastify/websocket"
import { z } from "zod"
import { registerErrorHandler } from "../error/error-handler"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/database"
import { Runtime } from "../runtime/runtime"
import { registerStatusRoutes } from "../status/status-routes"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { registerAgentSettingsRoutes } from "../agent-settings/agent-settings-routes"
import { createWorkspaceRepository } from "../workspace/repository"
import { registerWorkspaceRoutes } from "../workspace/routes"
import { createSessionRepository } from "../session/repository"
import { registerSessionRoutes } from "../session/routes"
import { createWorkspaceService } from "../workspace/service"
import { createSessionService } from "../session/service"
import { createEventJournalRepository } from "../event/journal.repository"
import { createEventCommitPublisher } from "../event/commit.publisher"
import { createRuntimeStatusService } from "../runtime/status.service"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { createAcpSupervisor } from "../acp/supervisor/acp-supervisor"
import { createAcpJournalWriter } from "../acp/journal/acp.journal.writer"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { SpawnAgentProcessFn } from "../acp/supervisor/spawn-agent-process"
import { registerEventStreamRoutes } from "../event/stream.routes"

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

  await app.register(websocket, {
    options: {
      perMessageDeflate: false,
    },
  })

  const agentSettingsRepository = createAgentSettingsRepository(database, {
    whichFn,
    validateExecutablePathFn,
  })
  const eventJournal = createEventJournalRepository(database)
  const commitPublisher = createEventCommitPublisher()
  const journalWriter = createAcpJournalWriter({
    database,
    eventJournal,
    commitPublisher,
  })
  const workspaceRepository = createWorkspaceRepository(database)
  const sessionRepository = createSessionRepository(database)

  registerEventStreamRoutes(app, {
    eventJournal,
    workspaceRepository,
    sessionRepository,
  })

  const acpSupervisor =
    providedAcpSupervisor ??
    createAcpSupervisor({
      agentSettingsRepository,
      serverVersion: runtime.version,
      journalWriter,
      spawnAgentProcessFn,
    })

  registerStatusRoutes(app, runtime, config, acpSupervisor)
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
