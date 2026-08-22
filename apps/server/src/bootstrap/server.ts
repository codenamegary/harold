import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { Writable } from "node:stream"
import websocket from "@fastify/websocket"
import { z } from "zod"
import { LogLevel } from "contracts/http/runtime-settings"
import { registerErrorHandler } from "../error/error-handler"
import { Config } from "../config/config"
import { EnvBindOverrides } from "../config/env.bind.overrides"
import { AgentDatabase } from "../persistence/database"
import { Runtime } from "../runtime/runtime"
import { registerStatusRoutes } from "../status/status-routes"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { registerAgentSettingsRoutes } from "../agent-settings/agent-settings-routes"
import {
  createRuntimeSettingsRepository,
  RuntimeSettingsRepository,
  seedDefaultsFromConfig,
} from "../runtime-settings/repository"
import { registerRuntimeSettingsRoutes } from "../runtime-settings/routes"
import { AppliedRuntimeSettingsHolder } from "../runtime-settings/applied.runtime.settings"
import { createWorkspaceRepository } from "../workspace/repository"
import { registerWorkspaceRoutes } from "../workspace/routes"
import { registerFilesystemBrowseRoutes } from "../filesystem/routes"
import { registerSessionRoutes } from "../session/routes"
import { createArchivedAcpSessionsStore } from "../session/archived.acp.sessions.store"
import { createWorkspaceService } from "../workspace/service"
import { createDeviceRepository } from "../device/repository"
import { createDeviceService } from "../device/service"
import { registerDeviceRoutes } from "../device/routes"
import { createConnectionTestService } from "../connection-test/connection.test.service"
import { registerConnectionTestRoutes } from "../connection-test/routes"
import { createRuntimeStatusService } from "../runtime/status.service"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { createAcpSupervisor } from "../acp/supervisor/supervisor"
import { AcpSupervisor } from "../acp/supervisor/models"
import { SpawnAgentProcessFn } from "../acp/supervisor/spawn.agent.process"
import { registerSessionStreamRoutes } from "../session/stream.routes"
import { createLogBuffer } from "../logs/log.buffer"
import { createLogSinkStream } from "../logs/log.sink.stream"
import { createLoggedAgentSpawn } from "../logs/logged.agent.spawn"
import { registerLogRoutes } from "../logs/routes"
import { createAcpHubPromptSession } from "../session/hub/acp.hub.prompt"
import {
  createSessionCwdCache,
  createSessionHub,
  SessionHub,
} from "../session/hub/session.hub"
import { registerAuthMiddleware } from "../auth/middleware"
import { redactPairingCodeInUrl } from "../device/redact.pairing.code.in.url"
import { FetchRegistryFn } from "../agent-settings/agent-settings-repository"
import { startEnabledAgents } from "./start.enabled.agents"

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
  fetchRegistryFn?: FetchRegistryFn
  registryUrl?: string
  acpSupervisor?: AcpSupervisor
  spawnAgentProcessFn?: SpawnAgentProcessFn
  isLoopbackRequest?: (request: FastifyRequest) => boolean
  wsAuthFrameTimeoutMs?: number
  logStream?: Writable
  logLevel?: LogLevel
  runtimeSettingsRepository?: RuntimeSettingsRepository
  appliedRuntimeSettings?: AppliedRuntimeSettingsHolder
  envBindOverrides?: EnvBindOverrides
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
  registerTestRoutes: withTestRoutes = false,
  whichFn,
  validateExecutablePathFn,
  fetchRegistryFn,
  registryUrl,
  acpSupervisor: providedAcpSupervisor,
  spawnAgentProcessFn,
  isLoopbackRequest,
  wsAuthFrameTimeoutMs,
  logStream,
  logLevel,
  runtimeSettingsRepository: providedRuntimeSettingsRepository,
  appliedRuntimeSettings,
  envBindOverrides,
}: CreateServerOptions) => {
  const logBuffer = createLogBuffer()
  const logSink = createLogSinkStream({
    buffer: logBuffer,
    downstream: logStream,
  })
  const app = Fastify({
    logger: buildLoggerOptions({ logStream: logSink, logLevel }),
  })
  const spawnFn = spawnAgentProcessFn ?? createLoggedAgentSpawn(logBuffer)

  registerErrorHandler(app)

  await app.register(websocket, {
    options: {
      perMessageDeflate: false,
    },
  })

  const deviceRepository = createDeviceRepository(database)
  const runtimeSettingsRepository =
    providedRuntimeSettingsRepository ??
    createRuntimeSettingsRepository({
      dataDir: config.dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })

  registerAuthMiddleware(app, {
    deviceRepository,
    getTrustedProxies: () => runtimeSettingsRepository.get().trustedProxies,
    isLoopbackRequest,
  })

  const agentSettingsRepository = createAgentSettingsRepository(database, {
    whichFn,
    validateExecutablePathFn,
    fetchRegistryFn,
    registryUrl,
  })
  const archivedAcpSessions = createArchivedAcpSessionsStore(database)
  const workspaceRepository = createWorkspaceRepository(database, {
    getAllowedRoots: () => runtimeSettingsRepository.get().allowedRoots,
  })

  const sessionHubRef: { current: SessionHub | null } = { current: null }
  const cwdCache = createSessionCwdCache()

  const acpSupervisor =
    providedAcpSupervisor ??
    createAcpSupervisor({
      agentSettingsRepository,
      serverVersion: runtime.version,
      spawnAgentProcessFn: spawnFn,
      onSessionUpdate: ({ agentId, acpSessionId, update }) => {
        sessionHubRef.current?.handleSessionUpdate({
          agentId,
          sessionId: acpSessionId,
          update,
        })
      },
      onSessionDiscovered: ({ agentId, sessionId, cwd }) => {
        cwdCache.remember({ agentId, sessionId, cwd })
      },
      requestPermission: (input) => {
        const hub = sessionHubRef.current
        if (hub === null) {
          throw new Error("session hub is not ready")
        }
        return hub.requestPermission(input)
      },
      requestExtensionRpc: (input) => {
        const hub = sessionHubRef.current
        if (hub === null) {
          throw new Error("session hub is not ready")
        }
        return hub.requestExtensionRpc(input)
      },
    })

  const sessionHub = createSessionHub({
    cwdCache,
    loadSession: async ({ agentId, sessionId, cwd }) => {
      const loaded = await acpSupervisor.loadSession({ agentId, sessionId, cwd })
      return loaded.ok ? { ok: true } : { ok: false, reason: loaded.reason }
    },
    promptSession: createAcpHubPromptSession({
      startPrompt: (params) => acpSupervisor.startPromptAcpSession(params),
    }),
    cancelSession: async ({ sessionId }) => {
      const cancelled = await acpSupervisor.cancelAcpSession({
        acpSessionId: sessionId,
      })
      return cancelled.ok
        ? { ok: true }
        : { ok: false, reason: cancelled.reason }
    },
  })
  sessionHubRef.current = sessionHub

  registerSessionStreamRoutes(app, {
    deviceRepository,
    sessionHub,
    getTrustedProxies: () => runtimeSettingsRepository.get().trustedProxies,
    isLoopbackRequest,
    wsAuthFrameTimeoutMs,
  })

  registerStatusRoutes(app, runtime, config, acpSupervisor)
  registerLogRoutes(app, logBuffer)
  const workspaceService = createWorkspaceService({
    workspaceRepository,
  })
  const runtimeStatusService = createRuntimeStatusService({
    runtime,
  })
  runtimeStatusService.persistStarting()

  registerWorkspaceRoutes(app, workspaceRepository, workspaceService, acpSupervisor)
  registerFilesystemBrowseRoutes(app, () => runtimeSettingsRepository.get().allowedRoots)
  registerAgentSettingsRoutes(app, agentSettingsRepository, acpSupervisor)
  registerRuntimeSettingsRoutes(app, runtimeSettingsRepository, {
    onLogLevelChanged: (nextLevel) => {
      app.log.level = nextLevel
    },
    workspaceRepository,
    workspaceService,
    acpSupervisor,
    appliedRuntimeSettings,
    envBindOverrides,
  })
  registerSessionRoutes(
    app,
    agentSettingsRepository,
    acpSupervisor,
    cwdCache,
    archivedAcpSessions,
  )

  const deviceService = createDeviceService({
    database,
    deviceRepository,
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

  await startEnabledAgents(agentSettingsRepository, acpSupervisor, app.log)

  return {
    app,
    acpSupervisor,
    runtimeStatusService,
    runtimeSettingsRepository,
  }
}
