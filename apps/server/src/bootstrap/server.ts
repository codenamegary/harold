import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { Writable } from "node:stream"
import websocket from "@fastify/websocket"
import multipart from "@fastify/multipart"
import { z } from "zod"
import { LogLevel } from "contracts/http/runtime-settings"
import { MAX_ATTACHMENT_BYTES } from "contracts/http/attachments"
import { registerErrorHandler } from "../error/error.handler"
import { Config } from "../config/config"
import { EnvBindOverrides } from "../config/env.bind.overrides"
import { AgentDatabase } from "../persistence/database"
import { Runtime } from "../runtime/runtime"
import { registerStatusRoutes } from "../status/status.routes"
import { assembleAgentSettingsSlice } from "../agent-settings/agent.settings.assembly"
import {
  makeRuntimeSettingsFileStore,
  RuntimeSettingsFileStore,
  seedDefaultsFromConfig,
} from "../runtime-settings/runtime-settings.file.adapters"
import { assembleRuntimeSettingsSlice } from "../runtime-settings/runtime-settings.assembly"
import { AppliedRuntimeSettingsHolder } from "../runtime-settings/applied.runtime.settings"
import { assembleWorkspaceSlice } from "../workspace/workspace.assembly"
import { registerFilesystemBrowseRoutes } from "../filesystem/routes"
import { assembleAttachmentsSlice } from "../attachments/attachments.assembly"
import { registerSessionRoutes } from "../session/routes"
import { createArchivedAcpSessionsStore } from "../session/archived.acp.sessions.store"
import { assembleDeviceSlice } from "../device/device.assembly"
import { createConnectionTestService } from "../connection-test/connection.test.service"
import { registerConnectionTestRoutes } from "../connection-test/routes"
import { createRuntimeStatusService } from "../runtime/status.service"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"
import { createAuthBroker, AuthBroker } from "../agent/auth/broker"
import { registerAgentAuthRoutes } from "../agent/auth/routes"
import { createSupervisorAuthHooks } from "../agent/auth/supervisor.hooks"
import { createAcpSupervisor } from "../acp/supervisor/supervisor"
import { AcpSupervisor } from "../acp/supervisor/models"
import {
  inventoryAdvertisesEmbeddedContext,
  inventoryAdvertisesPromptImage,
} from "../acp/agent/inventory"
import { SpawnAgentProcessFn } from "../acp/supervisor/spawn.agent.process"
import { registerSessionStreamRoutes } from "../session/stream.routes"
import { assembleLogsSlice } from "../logs/logs.assembly"
import { spawnAgentProcess } from "../acp/supervisor/spawn.agent.process"
import { ConsoleAsset } from "../console/console.assets"
import { registerConsoleRoutes } from "../console/console.routes"
import { createAcpHubPromptSession } from "../session/hub/acp.hub.prompt"
import { createSessionCwdCache, createSessionHub, SessionHub } from "../session/hub/hub"
import { createCommandsCache } from "../session/hub/commands.cache"
import { registerAuthMiddleware } from "../auth/middleware"
import { redactPairingCodeInUrl } from "../device/device.redact.pairing.code.in.url"
import { FetchRegistryFn } from "../agent-settings/agent.settings.ports"
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
  runtimeSettingsStore?: RuntimeSettingsFileStore
  appliedRuntimeSettings?: AppliedRuntimeSettingsHolder
  envBindOverrides?: EnvBindOverrides
  consoleAssets?: ReadonlyArray<ConsoleAsset>
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
  runtimeSettingsStore: providedRuntimeSettingsStore,
  appliedRuntimeSettings,
  envBindOverrides,
  consoleAssets,
}: CreateServerOptions) => {
  const logs = assembleLogsSlice({ downstream: logStream, spawnAgentProcess })
  const app = Fastify({
    logger: buildLoggerOptions({ logStream: logs.logSink, logLevel }),
  })
  const spawnFn = spawnAgentProcessFn ?? logs.spawnAgentProcessFn

  registerErrorHandler(app)

  await app.register(websocket, {
    options: {
      perMessageDeflate: false,
    },
  })

  await app.register(multipart, {
    limits: {
      fileSize: MAX_ATTACHMENT_BYTES,
      files: 1,
    },
  })

  const runtimeSettingsStore =
    providedRuntimeSettingsStore ??
    makeRuntimeSettingsFileStore({
      dataDir: config.dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })

  const device = assembleDeviceSlice({
    database,
    loopbackEndpoint: `http://${config.host}:${config.port}`,
    getAdvertisedEndpointSettings: () => {
      const settings = runtimeSettingsStore.get()
      return {
        advertisedUrl: settings.advertisedUrl,
        advertisedUrlEnabled: settings.advertisedUrlEnabled,
      }
    },
  })
  device.registerRoutes(app)

  registerAuthMiddleware(app, {
    findDeviceByCredentialHash: device.findDeviceByCredentialHash,
    touchDeviceLastSeen: device.touchDeviceLastSeen,
    getTrustedProxies: () => runtimeSettingsStore.get().trustedProxies,
    isLoopbackRequest,
  })

  const acpSupervisorRef: { current: AcpSupervisor } = { current: null! }
  const authBrokerRef: { current: AuthBroker | null } = { current: null }

  const agentSettings = assembleAgentSettingsSlice({
    database,
    whichFn,
    validateExecutablePathFn,
    fetchRegistryFn,
    registryUrl,
    acpSupervisor: () => acpSupervisorRef.current,
    authBroker: () => {
      const broker = authBrokerRef.current
      if (broker === null) {
        throw new Error("auth broker is not ready")
      }
      return broker
    },
  })
  const archivedAcpSessions = createArchivedAcpSessionsStore(database)
  const getAllowedRoots = () => runtimeSettingsStore.get().allowedRoots

  const sessionHubRef: { current: SessionHub | null } = { current: null }
  const cwdCache = createSessionCwdCache()
  const commandsCache = createCommandsCache()

  const agentExists = (agentId: string) => agentSettings.hasAgentId(agentId)

  const authBroker = createAuthBroker({
    agentExists,
    requestRespawn: async (agentId) => acpSupervisorRef.current.respawn(agentId),
  })
  authBrokerRef.current = authBroker

  acpSupervisorRef.current =
    providedAcpSupervisor ??
    createAcpSupervisor({
      agentSettingsRepository: agentSettings,
      serverVersion: runtime.version,
      spawnAgentProcessFn: spawnFn,
      authHooks: createSupervisorAuthHooks({
        authBroker,
        requestRespawn: async (agentId) => acpSupervisorRef.current.respawn(agentId),
      }),
      onSessionUpdate: ({ agentId, acpSessionId, update }) => {
        sessionHubRef.current?.handleSessionUpdate({
          agentId,
          sessionId: acpSessionId,
          update,
        })
      },
      onSessionConfig: ({ agentId, acpSessionId, configOptions }) => {
        sessionHubRef.current?.handleSessionConfig({
          agentId,
          sessionId: acpSessionId,
          configOptions,
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

  const acpSupervisor = acpSupervisorRef.current

  const workspace = assembleWorkspaceSlice({
    database,
    getAllowedRoots,
    listLiveByWorkspaceRoot: acpSupervisor.listLiveByWorkspaceRoot,
    closeWorkspaceSessions: acpSupervisor.closeWorkspaceSessions,
    unbindWorkspaceSessions: acpSupervisor.unbindWorkspaceSessions,
  })
  const attachments = assembleAttachmentsSlice({
    findWorkspaceById: workspace.findById,
  })

  const sessionHub = createSessionHub({
    cwdCache,
    commandsCache,
    loadSession: async ({ agentId, sessionId, cwd }) => {
      const loaded = await acpSupervisor.loadSession({ agentId, sessionId, cwd })
      return loaded.ok ? { ok: true } : { ok: false, reason: loaded.reason }
    },
    promptSession: createAcpHubPromptSession({
      startPrompt: (params) => acpSupervisor.startPromptAcpSession(params),
      resolveAttachment: async ({ sessionId, reference }) => {
        const workspaceRoot = acpSupervisor.getSessionBindingRegistry().getWorkspaceRoot(sessionId)
        if (workspaceRoot === undefined) {
          return null
        }
        return attachments.loadAttachment({
          workspacePath: workspaceRoot,
          reference,
        })
      },
      advertisesPromptCapability: ({ agentId, kind }) => {
        const inventory = acpSupervisor.getCapabilityInventory(agentId)
        if (kind === "image") {
          return inventoryAdvertisesPromptImage(inventory)
        }
        return inventoryAdvertisesEmbeddedContext(inventory)
      },
    }),
    cancelSession: async ({ sessionId }) => {
      const cancelled = await acpSupervisor.cancelAcpSession({
        acpSessionId: sessionId,
      })
      return cancelled.ok ? { ok: true } : { ok: false, reason: cancelled.reason }
    },
    authHooks: {
      ensureReadyForPrompt: async (agentId) => {
        const ready = await authBroker.ensureReadyForPrompt(agentId)
        return ready.ok ? { ok: true } : { ok: false }
      },
      ensureSessionFromChallenge: async (agentId) => {
        await authBroker.ensureSessionFromChallenge(agentId)
      },
    },
  })
  sessionHubRef.current = sessionHub

  authBroker.subscribe(({ agentId, auth }) => {
    sessionHub.broadcastAuthSessionUpdated({ agentId, auth })
  })

  registerSessionStreamRoutes(app, {
    findDeviceByCredentialHash: device.findDeviceByCredentialHash,
    touchDeviceLastSeen: device.touchDeviceLastSeen,
    sessionHub,
    getTrustedProxies: () => runtimeSettingsStore.get().trustedProxies,
    isLoopbackRequest,
    wsAuthFrameTimeoutMs,
  })

  registerStatusRoutes(app, runtime, config, acpSupervisor)
  logs.registerRoutes(app)
  const runtimeStatusService = createRuntimeStatusService({
    runtime,
  })
  runtimeStatusService.persistStarting()

  workspace.registerRoutes(app)
  registerFilesystemBrowseRoutes(app, getAllowedRoots)
  attachments.registerRoutes(app)
  agentSettings.registerRoutes(app)
  registerAgentAuthRoutes(app, authBroker, agentExists)
  const runtimeSettings = assembleRuntimeSettingsSlice({
    store: runtimeSettingsStore,
    listAllWorkspaces: workspace.listAll,
    deleteWorkspace: workspace.deleteWorkspace,
    onLogLevelChanged: (nextLevel) => {
      app.log.level = nextLevel
    },
    appliedRuntimeSettings,
    envBindOverrides,
  })
  runtimeSettings.registerRoutes(app)
  registerSessionRoutes(
    app,
    agentSettings,
    acpSupervisor,
    cwdCache,
    commandsCache,
    archivedAcpSessions,
    authBroker,
  )

  const connectionTestService = createConnectionTestService({
    getAdvertisedUrl: () => runtimeSettings.get().advertisedUrl,
    deviceProvisioning: device,
  })
  registerConnectionTestRoutes(app, connectionTestService)

  if (withTestRoutes) {
    registerTestRoutes(app)
  }

  registerConsoleRoutes(app, { assets: consoleAssets ?? [] })

  await startEnabledAgents(agentSettings, acpSupervisor, app.log)

  return {
    app,
    acpSupervisor,
    runtimeStatusService,
    runtimeSettingsStore,
  }
}
