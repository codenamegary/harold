import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { Writable } from "node:stream"
import websocket from "@fastify/websocket"
import { z } from "zod"
import { LogLevel } from "contracts/http/runtime-settings"
import { registerErrorHandler } from "../error/error-handler"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/database"
import { Runtime } from "../runtime/runtime"
import { registerStatusRoutes } from "../status/status-routes"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { registerAgentSettingsRoutes } from "../agent-settings/agent-settings-routes"
import {
  createRuntimeSettingsRepository,
  RuntimeSettingsRepository,
} from "../runtime-settings/repository"
import { registerRuntimeSettingsRoutes } from "../runtime-settings/routes"
import { createWorkspaceRepository } from "../workspace/repository"
import { registerWorkspaceRoutes } from "../workspace/routes"
import { createSessionRepository } from "../session/repository"
import { registerSessionRoutes } from "../session/routes"
import { createWorkspaceService } from "../workspace/service"
import { createSessionService } from "../session/service"
import { createDeviceRepository } from "../device/repository"
import { createDeviceService } from "../device/service"
import { registerDeviceRoutes } from "../device/routes"
import { createConnectionTestService } from "../connection-test/connection.test.service"
import { registerConnectionTestRoutes } from "../connection-test/routes"
import { createEventJournalRepository, EventJournalRepository } from "../event/journal.repository"
import { createEventCommitPublisher } from "../event/commit.publisher"
import { createRuntimeStatusService } from "../runtime/status.service"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { createAcpSupervisor } from "../acp/supervisor/acp-supervisor"
import { createAcpJournalWriter } from "../acp/journal/acp.journal.writer"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { SpawnAgentProcessFn } from "../acp/supervisor/spawn-agent-process"
import { registerEventStreamRoutes } from "../event/stream.routes"
import { runStartupRecovery } from "../session/startup.recovery"
import { registerAuthMiddleware } from "../auth/middleware"
import { redactPairingCodeInUrl } from "../device/redact.pairing.code.in.url"

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
  eventJournal?: EventJournalRepository
  registerTestRoutes?: boolean
  whichFn?: WhichFn
  validateExecutablePathFn?: ValidateExecutablePathFn
  acpSupervisor?: AcpSupervisor
  spawnAgentProcessFn?: SpawnAgentProcessFn
  isLoopbackRequest?: (request: FastifyRequest) => boolean
  wsAuthFrameTimeoutMs?: number
  logStream?: Writable
  logLevel?: LogLevel
  runtimeSettingsRepository?: RuntimeSettingsRepository
}

const loggerRedactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
] as const

type BuildLoggerOptionsParams = {
  logStream?: Writable
  logLevel?: LogLevel
}

const buildLoggerOptions = (params: BuildLoggerOptionsParams = {}) => {
  const { logStream, logLevel = "info" } = params
  const base = {
    level: logLevel,
    redact: {
      paths: [...loggerRedactPaths],
      remove: true,
    },
    serializers: {
      req(request: FastifyRequest) {
        return {
          method: request.method,
          url: redactPairingCodeInUrl(request.url),
          host: request.host,
          remoteAddress: request.ip,
          remotePort: request.socket.remotePort,
        }
      },
    },
  }

  return logStream === undefined ? base : { ...base, stream: logStream }
}

export const createServer = async ({
  config,
  runtime,
  database,
  eventJournal: providedEventJournal,
  registerTestRoutes: withTestRoutes = false,
  whichFn,
  validateExecutablePathFn,
  acpSupervisor: providedAcpSupervisor,
  spawnAgentProcessFn,
  isLoopbackRequest,
  wsAuthFrameTimeoutMs,
  logStream,
  logLevel,
  runtimeSettingsRepository: providedRuntimeSettingsRepository,
}: CreateServerOptions) => {
  const app = Fastify({
    logger: buildLoggerOptions({ logStream, logLevel }),
  })

  registerErrorHandler(app)

  await app.register(websocket, {
    options: {
      perMessageDeflate: false,
    },
  })

  const deviceRepository = createDeviceRepository(database)
  const runtimeSettingsRepository =
    providedRuntimeSettingsRepository ??
    createRuntimeSettingsRepository({ dataDir: config.dataDir })

  registerAuthMiddleware(app, {
    deviceRepository,
    getTrustedProxies: () => runtimeSettingsRepository.get().trustedProxies,
    isLoopbackRequest,
  })

  const agentSettingsRepository = createAgentSettingsRepository(database, {
    whichFn,
    validateExecutablePathFn,
  })
  const eventJournal = providedEventJournal ?? createEventJournalRepository(database)
  const commitPublisher = createEventCommitPublisher()
  const journalWriter = createAcpJournalWriter({
    database,
    eventJournal,
    commitPublisher,
  })
  const workspaceRepository = createWorkspaceRepository(database)
  const sessionRepository = createSessionRepository(database)
  const sessionService = createSessionService({
    database,
    sessionRepository,
    eventJournal,
    commitPublisher,
  })

  const offlineOnBindingClear = { enabled: true }
  const disposeOfflineOnBindingClear = () => {
    offlineOnBindingClear.enabled = false
  }

  const supervisorRef: { current: AcpSupervisor | null } = { current: null }

  const acpSupervisor =
    providedAcpSupervisor ??
    createAcpSupervisor({
      agentSettingsRepository,
      serverVersion: runtime.version,
      journalWriter,
      spawnAgentProcessFn,
      onBeforeClearRuntime: () => {
        if (!offlineOnBindingClear.enabled) {
          return
        }
        try {
          const marked = sessionService.markLiveSessionsOffline()
          if (!marked.ok) {
            throw new Error("failed to mark live sessions offline")
          }
        } catch (error: unknown) {
          if (!offlineOnBindingClear.enabled) {
            return
          }
          if (
            error instanceof RangeError &&
            error.message.includes("closed database")
          ) {
            return
          }
          throw error
        }
      },
      onSupervisorReady: () => {
        const supervisor = supervisorRef.current
        if (supervisor === null) {
          return
        }

        return runStartupRecovery({
          sessionRepository,
          sessionService,
          workspaceRepository,
          acpSupervisor: supervisor,
        })
      },
    })

  supervisorRef.current = acpSupervisor

  registerEventStreamRoutes(app, {
    database,
    eventJournal,
    commitPublisher,
    workspaceRepository,
    sessionRepository,
    sessionService,
    acpSupervisor,
    deviceRepository,
    getTrustedProxies: () => runtimeSettingsRepository.get().trustedProxies,
    isLoopbackRequest,
    wsAuthFrameTimeoutMs,
  })

  registerStatusRoutes(app, runtime, config, acpSupervisor)
  const workspaceService = createWorkspaceService({
    database,
    workspaceRepository,
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
  registerRuntimeSettingsRoutes(app, runtimeSettingsRepository, {
    onLogLevelChanged: (nextLevel) => {
      app.log.level = nextLevel
    },
  })
  registerSessionRoutes(
    app,
    sessionRepository,
    sessionService,
    workspaceRepository,
    agentSettingsRepository,
    acpSupervisor,
  )

  const deviceService = createDeviceService({
    database,
    deviceRepository,
    eventJournal,
    commitPublisher,
    config,
    runtimeSettingsRepository,
  })
  registerDeviceRoutes(app, deviceService)

  const connectionTestService = createConnectionTestService({
    runtimeSettingsRepository,
    deviceService,
  })
  registerConnectionTestRoutes(app, connectionTestService)

  if (withTestRoutes) {
    registerTestRoutes(app)
  }

  return {
    app,
    acpSupervisor,
    eventJournal,
    commitPublisher,
    runtimeStatusService,
    sessionService,
    runtimeSettingsRepository,
    disposeOfflineOnBindingClear,
  }
}
