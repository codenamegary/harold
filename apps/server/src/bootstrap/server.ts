import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import path from "node:path"
import { Writable } from "node:stream"
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
import { registerFilesystemBrowseRoutes } from "../filesystem/filesystem.routes"
import { assembleGitSlice } from "../git/git.assembly"
import {
  makeCanonicalizePath,
  makeReadDirectoryEntries,
} from "../filesystem/filesystem.node.adapters"
import { assembleAttachmentsSlice } from "../attachments/attachments.assembly"
import { registerSessionRoutes } from "../session/session.routes"
import { makeArchivedAcpSessionsStore } from "../session/session.archived.acp.sessions.sqlite.adapters"
import { assembleDeviceSlice } from "../device/device.assembly"
import { createRuntimeStatusService } from "../runtime/status.service"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "core/agent-settings/validate-agent-path"
import { createAuthBroker, AuthBroker } from "../agent/auth/broker"
import { registerAgentAuthRoutes } from "../agent/auth/routes"
import { createSupervisorAuthHooks } from "../agent/auth/supervisor.hooks"
import { createAcpSupervisor } from "../acp/supervisor/supervisor"
import { AcpSupervisor } from "../acp/supervisor/supervisor"
import {
  inventoryAdvertisesEmbeddedContext,
  inventoryAdvertisesPromptImage,
} from "../acp/agent/inventory"
import { SpawnAgentProcessFn } from "../acp/supervisor/supervisor.ports"
import { spawnAgentProcess } from "../acp/supervisor/supervisor.process.adapters"
import { registerSessionStreamSseRoutes } from "../session/session.stream.sse.routes"
import { registerSessionCommandsRoutes } from "../session/session.commands.routes"
import { createAcpPromptTurn } from "../session/hub/acp.hub.prompt"
import { createSessionCwdCache, createSessionHub, SessionHub } from "../session/hub/hub"
import { createCommandsCache } from "../session/hub/commands.cache"
import { createConfigOptionsCache } from "../session/hub/config.cache"
import { createConfigOptionsFileCache } from "../session/hub/config.cache.file"
import { createSessionEventLog } from "../session/hub/event.log"
import { createSessionTitleCache } from "../session/hub/session.title.cache"
import { makeEnsureSessionBound, makeEnsureSupervisorReady } from "../session/session.acp.ready"
import { makeAcceptPrompt, makeCompletePromptTurn } from "../session/session.prompt.gate.usecase"
import { SessionHubLoadSession, StartAcpAgent } from "../session/session.ports"
import { registerAuthMiddleware } from "../auth/middleware"
import { redactPairingCodeInUrl } from "core/device/redact.pairing.code.in.url"
import { FetchRegistryFn } from "core/agent-settings/ports"
import { startEnabledAgents, StartEnabledAgentResult } from "./start.enabled.agents"

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
  /** Test seam: replaces the supervisor's agent start used by session routes. */
  startAcpAgentFn?: StartAcpAgent
  /** Interval for SSE `: ping` heartbeat comments on session event streams. */
  sseHeartbeatMs?: number
  logStream?: Writable
  logLevel?: LogLevel
  runtimeSettingsStore?: RuntimeSettingsFileStore
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
  startAcpAgentFn,
  sseHeartbeatMs,
  logStream,
  logLevel,
  runtimeSettingsStore: providedRuntimeSettingsStore,
  appliedRuntimeSettings,
  envBindOverrides,
}: CreateServerOptions) => {
  const app = Fastify({
    logger: buildLoggerOptions({ logStream, logLevel }),
  })
  const spawnFn = spawnAgentProcessFn ?? spawnAgentProcess

  registerErrorHandler(app)

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

  const device = assembleDeviceSlice({ database })
  device.registerRoutes(app)

  registerAuthMiddleware(app, {
    findDeviceByCredentialHash: device.findDeviceByCredentialHash,
    touchDeviceLastSeen: device.touchDeviceLastSeen,
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
  const archivedAcpSessions = makeArchivedAcpSessionsStore(database)

  const sessionHubRef: { current: SessionHub | null } = { current: null }
  const cwdCache = createSessionCwdCache()
  const commandsCache = createCommandsCache()
  const configCache = createConfigOptionsCache(
    createConfigOptionsFileCache(path.join(config.dataDir, "session-config-cache.json")),
  )
  const eventLog = createSessionEventLog()
  const sessionTitleCache = createSessionTitleCache()

  const agentExists = (agentId: string) => agentSettings.hasAgentId(agentId)

  const authBroker = createAuthBroker({
    agentExists,
    requestRespawn: async (agentId) => {
      const result = await acpSupervisorRef.current.respawn(agentId)
      if (!result.ok) {
        throw new Error(result.reason)
      }
    },
  })
  authBrokerRef.current = authBroker

  acpSupervisorRef.current =
    providedAcpSupervisor ??
    createAcpSupervisor({
      agentSettingsRepository: agentSettings,
      serverVersion: runtime.version,
      spawnAgentProcessFn: spawnFn,
      logUnknownExtension: (method) => app.log.warn({ method }, "unknown ACP extension"),
      authHooks: createSupervisorAuthHooks({
        authBroker,
        requestRespawn: async (agentId) => {
          const result = await acpSupervisorRef.current.respawn(agentId)
          if (!result.ok) {
            throw new Error(result.reason)
          }
        },
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
      requestElicitation: (input) => {
        const hub = sessionHubRef.current
        if (hub === null) {
          throw new Error("session hub is not ready")
        }
        return hub.requestElicitation(input)
      },
      onElicitationComplete: (input) => {
        sessionHubRef.current?.completeElicitation(input)
      },
      onElicitationCancel: (input) => {
        sessionHubRef.current?.cancelElicitationByAgent(input)
      },
      onBeforeClearRuntime: (agentId) => {
        sessionHubRef.current?.agentExited({ agentId })
      },
    })

  const acpSupervisor = acpSupervisorRef.current

  const ensureSupervisorReady = makeEnsureSupervisorReady({
    getRunningAgentIds: () => acpSupervisor.getRunningAgentIds(),
    start: startAcpAgentFn ?? ((agentId) => acpSupervisor.start(agentId)),
  })

  const canonicalizePath = makeCanonicalizePath()
  const git = assembleGitSlice({ canonicalizePath })
  const workspace = assembleWorkspaceSlice({
    database,
    canonicalizePath,
    readDirectoryEntries: makeReadDirectoryEntries(),
    listLiveByWorkspaceRoot: acpSupervisor.listLiveByWorkspaceRoot,
    closeWorkspaceSessions: acpSupervisor.closeWorkspaceSessions,
    unbindWorkspaceSessions: acpSupervisor.unbindWorkspaceSessions,
  })
  const attachments = assembleAttachmentsSlice({
    findSessionCwd: cwdCache.get,
    canonicalizePath,
  })

  const loadHubSession: SessionHubLoadSession = async ({ agentId, sessionId, cwd }) => {
    const loaded = await acpSupervisor.loadSession({ agentId, sessionId, cwd })
    return loaded.ok
      ? { ok: true }
      : {
          ok: false,
          reason: loaded.reason,
          ...(loaded.authRequired === true ? { authRequired: true } : {}),
        }
  }

  const runPromptTurn = createAcpPromptTurn({
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
  })

  const sessionHub = createSessionHub({
    cwdCache,
    commandsCache,
    configCache,
    eventLog,
    sessionTitleCache,
    loadSession: loadHubSession,
    runPromptTurn,
    acceptPrompt: makeAcceptPrompt({
      advertisesPromptCapability: ({ agentId, kind }) => {
        const inventory = acpSupervisor.getCapabilityInventory(agentId)
        if (kind === "image") {
          return inventoryAdvertisesPromptImage(inventory)
        }
        return inventoryAdvertisesEmbeddedContext(inventory)
      },
      ensureReadyForPrompt: async (agentId) => {
        const ready = await authBroker.ensureReadyForPrompt(agentId)
        return ready.ok ? { ok: true } : { ok: false }
      },
      ensureSessionBound: makeEnsureSessionBound({
        isSessionBound: (sessionId) =>
          acpSupervisor.getSessionBindingRegistry().getBinding(sessionId) !== undefined,
        ensureSupervisorReady,
        loadSession: loadHubSession,
      }),
    }),
    completePromptTurn: makeCompletePromptTurn({
      ensureSessionFromChallenge: async (agentId) => {
        await authBroker.ensureSessionFromChallenge(agentId)
      },
    }),
    cancelSession: async ({ sessionId }) => {
      const cancelled = await acpSupervisor.cancelAcpSession({
        acpSessionId: sessionId,
      })
      return cancelled.ok ? { ok: true } : { ok: false, reason: cancelled.reason }
    },
    logElicitation: (event) => {
      app.log.info(event, "ACP elicitation settled")
    },
  })
  sessionHubRef.current = sessionHub

  authBroker.subscribe(({ agentId, auth }) => {
    sessionHub.broadcastAuthSessionUpdated({ agentId, auth })
  })

  registerSessionCommandsRoutes(app, { sessionHub })

  registerSessionStreamSseRoutes(app, {
    sessionHub,
    cwdCache,
    touchDeviceLastSeen: device.touchDeviceLastSeen,
    ...(sseHeartbeatMs === undefined ? {} : { sseHeartbeatMs }),
  })

  registerStatusRoutes(app, runtime)
  const runtimeStatusService = createRuntimeStatusService({
    runtime,
  })
  runtimeStatusService.persistStarting()

  workspace.registerRoutes(app)
  registerFilesystemBrowseRoutes(app)
  git.registerRoutes(app)
  attachments.registerRoutes(app)
  agentSettings.registerRoutes(app)
  registerAgentAuthRoutes(app, authBroker, agentExists)
  const runtimeSettings = assembleRuntimeSettingsSlice({
    store: runtimeSettingsStore,
    appliedRuntimeSettings,
    envBindOverrides,
  })
  runtimeSettings.registerRoutes(app)
  registerSessionRoutes(app, {
    acpSupervisor,
    findAgentSettings: (agentId) =>
      agentSettings.list().find((settings) => settings.id === agentId),
    ensureSupervisorReady,
    cwdCache,
    commandsCache,
    configCache,
    eventLog,
    getSessionTitle: sessionTitleCache.getSessionTitle,
    forgetSessionTitle: sessionTitleCache.forgetSessionTitle,
    isArchivedAcpSession: archivedAcpSessions.isArchived,
    archiveAcpSession: archivedAcpSessions.archive,
    closeSession: (input) => sessionHub.closeSession(input),
    authBroker,
  })

  if (withTestRoutes) {
    registerTestRoutes(app)
  }

  /**
   * Agent warm-up is a caller decision, not part of building the app. The
   * daemon fires this after the listener is up so `harold start` returns
   * without waiting on agent processes; the lazy session path still starts
   * any agent that is not running yet.
   */
  const warmAgents = (): Promise<ReadonlyArray<StartEnabledAgentResult>> =>
    startEnabledAgents(agentSettings, acpSupervisor, app.log)

  return {
    app,
    acpSupervisor,
    runtimeStatusService,
    runtimeSettingsStore,
    warmAgents,
  }
}
