import { AgentId } from "contracts/http/agent-settings"
import { SupervisorAuthHooks } from "../../agent/auth/supervisor.hooks"
import { buildCapabilityInventory, CapabilityInventory } from "../agent/inventory"
import { agentMethodDeclarations } from "../agent/method.declarations"
import { SessionOwnership } from "../agent/session.ownership"
import { resolveExtensionHandlers } from "../client/extensions/extension.handlers"
import {
  registerAcpClientHandlers,
  createUnavailableRequestExtensionRpc,
  createUnavailableRequestPermission,
} from "../client/register.handlers"
import { SessionBindingRegistry } from "../client/session.binding.registry"
import { createJsonRpcTransport, JsonRpcTransport } from "../transport/json.rpc.transport"
import { sanitizeFailureReason } from "../sanitize.failure.reason"
import {
  AcpAgentRuntimeState,
  AcpStartResult,
  AcpSupervisorState,
  AgentSettingsReader,
  DEFAULT_ACP_RESTART_BACKOFF_MS,
  RequestExtensionRpcFn,
  RequestPermissionFn,
  SessionUpdateHandler,
  SpawnedAgentProcess,
} from "./models"
import { SpawnAgentProcessFn } from "./supervisor.ports"
import { buildAdapterAuthContext } from "./supervisor.auth.context"
import { resolveStartConfig } from "./supervisor.resolve.start.config"

export type SupervisorRuntime = {
  agentId: AgentId
  state: AcpSupervisorState
  lastError: string | null
  capabilityInventory: CapabilityInventory | null
  transport: JsonRpcTransport | null
  process: SpawnedAgentProcess | null
  exitMonitor: Promise<void> | null
  acceptUnexpectedExit: boolean
  restartGeneration: number
  /** In-flight spawn plus initialize, shared by every caller racing to start. */
  startPromise: Promise<void> | null
}

export type CreateSupervisorLifecycleParams = {
  agentSettingsRepository: AgentSettingsReader
  serverVersion: string
  sessionBindingRegistry: SessionBindingRegistry
  sessionOwnership: SessionOwnership
  onSessionUpdate?: SessionUpdateHandler
  requestPermission?: RequestPermissionFn
  requestExtensionRpc?: RequestExtensionRpcFn
  logUnknownExtension?: (method: string) => void
  onBeforeClearRuntime?: () => void
  onSupervisorReady?: () => void | Promise<void>
  restartBackoffMs?: ReadonlyArray<number>
  sleepFn?: (ms: number) => Promise<void>
  spawnAgentProcessFn: SpawnAgentProcessFn
  createTransportFn?: (process: SpawnedAgentProcess) => JsonRpcTransport
  authHooks?: SupervisorAuthHooks
}

const monitorProcessExit = async (
  runtimes: Map<AgentId, SupervisorRuntime>,
  agentId: AgentId,
  process: SpawnedAgentProcess,
  onUnexpectedExit: () => void,
) => {
  const exitCode = await process.waitForExit()
  const runtime = runtimes.get(agentId)
  if (runtime === undefined || runtime.process !== process) {
    return
  }

  if (exitCode !== 0) {
    onUnexpectedExit()
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const createEmptyRuntime = (agentId: AgentId): SupervisorRuntime => ({
  agentId,
  state: "stopped",
  lastError: null,
  capabilityInventory: null,
  process: null,
  transport: null,
  exitMonitor: null,
  acceptUnexpectedExit: false,
  restartGeneration: 0,
  startPromise: null,
})

/**
 * Process-lifecycle engine for ACP agents: spawn plus initialize, exit
 * monitoring, bounded restart backoff, and start/stop/respawn. Session-facing
 * operations live in `supervisor.session.ops.ts`.
 */
export const createSupervisorLifecycle = ({
  agentSettingsRepository,
  serverVersion,
  sessionBindingRegistry,
  sessionOwnership,
  onSessionUpdate = () => undefined,
  requestPermission = createUnavailableRequestPermission(),
  requestExtensionRpc = createUnavailableRequestExtensionRpc(),
  logUnknownExtension,
  onBeforeClearRuntime = () => undefined,
  onSupervisorReady = () => undefined,
  restartBackoffMs = DEFAULT_ACP_RESTART_BACKOFF_MS,
  sleepFn = defaultSleep,
  spawnAgentProcessFn,
  createTransportFn = (process) =>
    createJsonRpcTransport({
      stdin: process.stdin,
      stdout: process.stdout,
    }),
  authHooks,
}: CreateSupervisorLifecycleParams) => {
  const runtimes = new Map<AgentId, SupervisorRuntime>()

  const unbindAgentSessions = (agentId: AgentId) => {
    for (const acpSessionId of sessionOwnership.sessionsOwnedBy(agentId)) {
      sessionBindingRegistry.unbind({ acpSessionId })
      sessionOwnership.forget({ acpSessionId })
    }
  }

  const clearRuntime = (agentId: AgentId, options?: { keepEntry?: boolean }) => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      return
    }

    runtime.acceptUnexpectedExit = false
    const process = runtime.process
    const transport = runtime.transport
    runtime.transport = null
    runtime.process = null
    runtime.exitMonitor = null
    runtime.capabilityInventory = null
    unbindAgentSessions(agentId)
    transport?.close()
    process?.kill()
    if (!options?.keepEntry) {
      runtimes.delete(agentId)
    }
  }

  const cancelRestart = (agentId: AgentId) => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      return
    }

    runtime.restartGeneration += 1
  }

  const transitionToError = (agentId: AgentId, reason: string) => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      return
    }

    cancelRestart(agentId)
    if (runtime.state === "ready" || runtime.state === "starting") {
      onBeforeClearRuntime()
    }
    clearRuntime(agentId, { keepEntry: true })
    runtime.state = "error"
    runtime.lastError = reason
  }

  const stopRuntime = async (agentId: AgentId): Promise<void> => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      return
    }

    cancelRestart(agentId)
    if (runtime.state === "ready") {
      onBeforeClearRuntime()
    }
    clearRuntime(agentId)
  }

  const stop = async (): Promise<void> => {
    const activeAgentIds = [...runtimes.keys()]
    await Promise.all(activeAgentIds.map((agentId) => stopRuntime(agentId)))
  }

  const attachExitMonitor = (agentId: AgentId, process: SpawnedAgentProcess) => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      return
    }

    runtime.acceptUnexpectedExit = true
    runtime.exitMonitor = monitorProcessExit(runtimes, agentId, process, () => {
      const current = runtimes.get(agentId)
      if (current === undefined || !current.acceptUnexpectedExit) {
        return
      }
      handleUnexpectedExit(agentId)
    })
  }

  const spawnAndInitialize = async (agentId: AgentId): Promise<void> => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      throw new Error("ACP supervisor runtime is not available")
    }

    const resolved = resolveStartConfig(agentSettingsRepository, agentId)
    if (!resolved.ok) {
      throw new Error(resolved.reason)
    }

    const process = spawnAgentProcessFn({
      profile: resolved.profile,
      executablePath: resolved.executablePath,
      args: resolved.args,
    })
    const transport = createTransportFn(process)

    runtime.process = process
    runtime.transport = transport

    registerAcpClientHandlers({
      transport,
      agentId,
      sessionBindingRegistry,
      requestPermission,
      logUnknownExtension,
      extensionHandlers: resolveExtensionHandlers(agentId, requestExtensionRpc),
    })

    transport.onNotification("session/update", (params) => {
      const value = params as { sessionId?: string; update?: unknown }
      if (value.sessionId === undefined) {
        return
      }

      onSessionUpdate({
        agentId,
        acpSessionId: value.sessionId,
        update: value.update,
      })
    })

    const authAdapter = authHooks?.resolveAdapter(agentId)
    const authContext = buildAdapterAuthContext(agentId)

    const initResult = await transport.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: authAdapter
        ? authAdapter.clientAuthCapabilities(authContext)
        : resolved.profile.clientCapabilities,
      clientInfo: { name: "harold", version: serverVersion },
    })

    runtime.capabilityInventory = buildCapabilityInventory({
      initializeResult: initResult,
      declarations: agentMethodDeclarations,
    })

    if (authHooks && authAdapter) {
      const ctx = buildAdapterAuthContext(agentId, initResult)
      await authAdapter.onStart(ctx)
      await authHooks.authBroker.observeInitialize({ agentId, initializeResult: initResult })
    } else if (!authHooks) {
      await transport.request("authenticate", {
        methodId: resolved.profile.authMethodId,
      })
    }

    runtime.state = "ready"
    runtime.lastError = null
    attachExitMonitor(agentId, process)
    void Promise.resolve(onSupervisorReady())
  }

  const beginBoundedRestart = (agentId: AgentId) => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      return
    }

    runtime.restartGeneration += 1
    const generation = runtime.restartGeneration
    runtime.state = "starting"

    void (async () => {
      for (const delayMs of restartBackoffMs) {
        const current = runtimes.get(agentId)
        if (current === undefined || generation !== current.restartGeneration) {
          return
        }

        await sleepFn(delayMs)

        const afterSleep = runtimes.get(agentId)
        if (afterSleep === undefined || generation !== afterSleep.restartGeneration) {
          return
        }

        try {
          clearRuntime(agentId, { keepEntry: true })
          const restarting = runtimes.get(agentId)
          if (restarting === undefined) {
            return
          }
          restarting.state = "starting"
          await spawnAndInitialize(agentId)
          return
        } catch {
          clearRuntime(agentId, { keepEntry: true })
          const retrying = runtimes.get(agentId)
          if (retrying === undefined) {
            return
          }
          retrying.state = "starting"
        }
      }

      const finalRuntime = runtimes.get(agentId)
      if (finalRuntime !== undefined && generation === finalRuntime.restartGeneration) {
        finalRuntime.state = "error"
        finalRuntime.lastError = "ACP supervisor failed to restart"
      }
    })()
  }

  const handleUnexpectedExit = (agentId: AgentId) => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      return
    }

    runtime.acceptUnexpectedExit = false
    const wasReady = runtime.state === "ready"

    if (!wasReady) {
      return
    }

    onBeforeClearRuntime()
    clearRuntime(agentId, { keepEntry: true })
    beginBoundedRestart(agentId)
  }

  /**
   * Outcome of a spawn that has settled. A runtime the supervisor already
   * cleared was stopped mid-flight, so its caller must not be told it started.
   */
  const settleStartOutcome = (runtime: SupervisorRuntime): AcpStartResult => {
    if (runtimes.get(runtime.agentId) !== runtime) {
      return { ok: false, reason: "ACP supervisor was stopped while the agent was starting" }
    }

    return runtime.state === "ready"
      ? { ok: true }
      : { ok: false, reason: runtime.lastError ?? "ACP supervisor failed to start" }
  }

  /**
   * The starting caller owns the error transition, so a caller that raced it
   * only reports the settled outcome instead of spawning a second agent.
   */
  const waitForInFlightStart = async (runtime: SupervisorRuntime): Promise<AcpStartResult> => {
    const inFlight = runtime.startPromise
    if (inFlight !== null) {
      try {
        await inFlight
      } catch {
        // Reported from the settled runtime state below.
      }
    }

    return settleStartOutcome(runtime)
  }

  const start = async (agentId: AgentId): Promise<AcpStartResult> => {
    const existing = runtimes.get(agentId)
    if (existing?.state === "starting") {
      return waitForInFlightStart(existing)
    }

    if (existing?.state === "ready") {
      return { ok: true }
    }

    if (existing !== undefined) {
      await stopRuntime(agentId)
    }

    const resolved = resolveStartConfig(agentSettingsRepository, agentId)
    if (!resolved.ok) {
      return { ok: false, reason: resolved.reason }
    }

    const runtime = createEmptyRuntime(agentId)
    runtime.state = "starting"
    runtimes.set(agentId, runtime)

    const inFlight = spawnAndInitialize(agentId).finally(() => {
      if (runtimes.get(agentId) === runtime) {
        runtime.startPromise = null
      }
    })
    runtime.startPromise = inFlight

    try {
      await inFlight
    } catch (error: unknown) {
      const reason = sanitizeFailureReason(error, "ACP supervisor failed to start")
      transitionToError(agentId, reason)
      return { ok: false, reason }
    }

    return settleStartOutcome(runtime)
  }

  const handleAgentDisabled = async (agentId: AgentId): Promise<void> => {
    if (runtimes.get(agentId) === undefined) {
      return
    }
    await stopRuntime(agentId)
  }

  const respawn = async (agentId: AgentId): Promise<AcpStartResult> => {
    await stopRuntime(agentId)
    return start(agentId)
  }

  const getAgentRuntimeState = (agentId: AgentId): AcpAgentRuntimeState => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined) {
      return { status: "stopped", error: null }
    }

    switch (runtime.state) {
      case "stopped":
      case "starting":
      case "ready":
        return { status: runtime.state, error: null }
      case "error": {
        // Both error transitions set lastError; the fallback only guards the invariant.
        return { status: "error", error: runtime.lastError ?? "ACP supervisor failed to restart" }
      }
    }
  }

  return {
    runtimes,
    start,
    stop,
    respawn,
    handleAgentDisabled,
    getAgentRuntimeState,
  }
}
