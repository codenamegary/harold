import { AgentId } from "contracts/http/agent-settings"
import {
  inventoryAdvertisesSessionClose,
  inventoryAdvertisesSessionList,
  inventorySupportsRequiredCapability,
} from "../agent/inventory"
import { AgentMethodTable } from "../agent/method.table"
import { SessionOwnership } from "../agent/session.ownership"
import { SessionBindingRegistry } from "../client/session.binding.registry"
import { JsonRpcTransport } from "../transport/json.rpc.transport"
import { sanitizeFailureReason } from "../sanitize.failure.reason"
import {
  AcpListSessionsResult,
  AcpSession,
  AcpSessionCancelResult,
  AcpSessionCloseResult,
  AcpSessionOperationResult,
  AcpSessionPromptResult,
  AcpSessionPromptStartResult,
  AcpSetConfigOptionResult,
  AcpStartResult,
  AcpSupervisorState,
  CloseWorkspaceSessionFailure,
  CloseWorkspaceSessionsResult,
  LiveWorkspaceSession,
  SessionConfigHandler,
  SessionDiscoveredHandler,
} from "./models"
import { CapabilityInventory } from "../agent/inventory"

/** Read-only shape of a runtime entry the session operations may rely on. */
export type SupervisorRuntimeView = {
  readonly agentId: AgentId
  readonly state: AcpSupervisorState
  readonly capabilityInventory: CapabilityInventory | null
  readonly transport: JsonRpcTransport | null
}

export type CreateSupervisorSessionOpsParams = {
  /** Live runtime entries, owned by the lifecycle engine. */
  runtimes: Map<AgentId, SupervisorRuntimeView>
  sessionBindingRegistry: SessionBindingRegistry
  sessionOwnership: SessionOwnership
  agentMethodTable: AgentMethodTable
  onSessionDiscovered?: SessionDiscoveredHandler
  onSessionConfig?: SessionConfigHandler
  /** Lifecycle start, injected so the ops can lazily ready an agent. */
  start: (agentId: AgentId) => Promise<AcpStartResult>
}

/**
 * Session-facing supervisor operations: routing an ACP session to a ready
 * runtime and proxying agent method calls. Transport mechanics (spawning,
 * restarts, exit monitors) live in `supervisor.lifecycle.ts`.
 */
export const createSupervisorSessionOps = ({
  runtimes,
  sessionBindingRegistry,
  sessionOwnership,
  agentMethodTable,
  onSessionDiscovered = () => undefined,
  onSessionConfig = () => undefined,
  start,
}: CreateSupervisorSessionOpsParams) => {
  const getReadyRuntime = (agentId: AgentId): SupervisorRuntimeView | null => {
    const runtime = runtimes.get(agentId)
    if (runtime === undefined || runtime.state !== "ready" || runtime.transport === null) {
      return null
    }
    return runtime
  }

  const resolveReadyAgentId = (agentId?: AgentId): AgentId | null => {
    if (agentId !== undefined) {
      return getReadyRuntime(agentId) === null ? null : agentId
    }

    const readyIds = [...runtimes.values()]
      .filter((runtime) => runtime.state === "ready")
      .map((runtime) => runtime.agentId)
    return readyIds[0] ?? null
  }

  const getRunningAgentId = () => resolveReadyAgentId()

  const getRunningAgentIds = () =>
    [...runtimes.values()]
      .filter((runtime) => runtime.state === "ready")
      .map((runtime) => runtime.agentId)

  const getCapabilityInventory = (agentId: AgentId): CapabilityInventory | null =>
    getReadyRuntime(agentId)?.capabilityInventory ?? null

  const getTransport = (agentId?: AgentId): JsonRpcTransport | null => {
    const resolvedAgentId = resolveReadyAgentId(agentId)
    if (resolvedAgentId === null) {
      return null
    }
    return getReadyRuntime(resolvedAgentId)?.transport ?? null
  }

  const resolveRuntimeForAcpSession = (acpSessionId: string): SupervisorRuntimeView | null => {
    const ownerAgentId = sessionOwnership.ownerOf(acpSessionId)
    if (ownerAgentId === undefined) {
      return null
    }
    return getReadyRuntime(ownerAgentId)
  }

  const rememberAcpSession = (agentId: AgentId, acpSessionId: string) => {
    sessionOwnership.remember({ agentId, acpSessionId })
  }

  const createAcpSession = async ({
    agentId,
    workspaceCwd,
    sessionId,
    workspaceId,
  }: {
    agentId?: AgentId
    workspaceCwd: string
    sessionId: string
    workspaceId: string
  }): Promise<AcpSessionOperationResult> => {
    const resolvedAgentId = resolveReadyAgentId(agentId)
    if (resolvedAgentId === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const runtime = getReadyRuntime(resolvedAgentId)
    if (runtime === null || runtime.transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const handler = agentMethodTable.resolve({ agentId: resolvedAgentId, method: "session/new" })
    if (handler === undefined) {
      return { ok: false, reason: "Agent does not support session/new" }
    }

    return handler({
      params: { workspaceCwd, sessionId, workspaceId },
      context: {
        agentId: resolvedAgentId,
        transport: runtime.transport,
        sessionBindings: sessionBindingRegistry,
        sessionOwnership,
        onSessionDiscovered,
        supportsCapability: (path) =>
          inventorySupportsRequiredCapability(runtime.capabilityInventory, path),
      },
    })
  }

  const createSession = async ({
    agentId,
    cwd,
  }: {
    agentId: AgentId
    cwd: string
  }): Promise<AcpSessionOperationResult> => {
    const runtime = getReadyRuntime(agentId)
    if (runtime === null || runtime.transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const handler = agentMethodTable.resolve({ agentId, method: "session/new" })
    if (handler === undefined) {
      return { ok: false, reason: "Agent does not support session/new" }
    }

    const result = await handler({
      params: {
        workspaceCwd: cwd,
        sessionId: "",
        workspaceId: "",
        discoverOnCreate: true,
      },
      context: {
        agentId,
        transport: runtime.transport,
        sessionBindings: sessionBindingRegistry,
        sessionOwnership,
        onSessionDiscovered,
        supportsCapability: (path) =>
          inventorySupportsRequiredCapability(runtime.capabilityInventory, path),
      },
    })

    if (result.ok && result.configOptions.length > 0) {
      onSessionConfig({
        agentId,
        acpSessionId: result.acpSessionId,
        configOptions: result.configOptions,
      })
    }

    return result
  }

  const setConfigOption = async ({
    agentId,
    sessionId,
    configId,
    value,
  }: {
    agentId: AgentId
    sessionId: string
    configId: string
    value: string | boolean
  }): Promise<AcpSetConfigOptionResult> => {
    const runtime = getReadyRuntime(agentId)
    if (runtime === null || runtime.transport === null) {
      return { ok: false, kind: "error", reason: "ACP supervisor is not ready" }
    }

    const handler = agentMethodTable.resolve({
      agentId,
      method: "session/set_config_option",
    })
    if (handler === undefined) {
      return {
        ok: false,
        kind: "unsupported",
        reason: "Agent does not support session/set_config_option",
      }
    }

    const result = await handler({
      params: { acpSessionId: sessionId, configId, value },
      context: {
        agentId,
        transport: runtime.transport,
        sessionBindings: sessionBindingRegistry,
        sessionOwnership,
        onSessionDiscovered,
        supportsCapability: (path) =>
          inventorySupportsRequiredCapability(runtime.capabilityInventory, path),
      },
    })

    if (result.ok) {
      onSessionConfig({
        agentId,
        acpSessionId: sessionId,
        configOptions: result.configOptions,
      })
    }

    return result
  }

  const listAcpSessions = async (params?: { cwd?: string }): Promise<AcpListSessionsResult> => {
    const readyRuntimes = [...runtimes.values()].filter(
      (runtime) =>
        runtime.state === "ready" &&
        runtime.transport !== null &&
        inventoryAdvertisesSessionList(runtime.capabilityInventory),
    )

    try {
      const listedByAgent = await Promise.all(
        readyRuntimes.map(async (runtime) => {
          const transport = runtime.transport
          if (transport === null) {
            return [] as AcpSession[]
          }

          const handler = agentMethodTable.resolve({
            agentId: runtime.agentId,
            method: "session/list",
          })
          if (handler === undefined) {
            return [] as AcpSession[]
          }

          const result = await handler({
            params: params?.cwd === undefined ? {} : { cwd: params.cwd },
            context: {
              agentId: runtime.agentId,
              transport,
              sessionBindings: sessionBindingRegistry,
              sessionOwnership,
              onSessionDiscovered,
              supportsCapability: (path) =>
                inventorySupportsRequiredCapability(runtime.capabilityInventory, path),
            },
          })

          if (!result.ok) {
            throw new Error(result.reason)
          }

          return result.sessions
        }),
      )

      return { ok: true, sessions: listedByAgent.flat() }
    } catch (error: unknown) {
      return {
        ok: false,
        reason: sanitizeFailureReason(error, "session/list failed"),
      }
    }
  }

  const loadSession = async ({
    agentId,
    sessionId,
    cwd,
  }: {
    agentId: AgentId
    sessionId: string
    cwd: string
  }): Promise<AcpSessionOperationResult> => {
    rememberAcpSession(agentId, sessionId)
    return loadAcpSession({
      acpSessionId: sessionId,
      workspaceCwd: cwd,
      sessionId,
      workspaceId: sessionId,
    })
  }

  const loadAcpSession = async ({
    acpSessionId,
    workspaceCwd,
    sessionId,
    workspaceId,
  }: {
    acpSessionId: string
    workspaceCwd: string
    sessionId: string
    workspaceId: string
  }): Promise<AcpSessionOperationResult> => {
    const runtime = resolveRuntimeForAcpSession(acpSessionId)
    if (runtime === null || runtime.transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const handler = agentMethodTable.resolve({ agentId: runtime.agentId, method: "session/load" })
    if (handler === undefined) {
      return { ok: false, reason: "Agent does not support session/load" }
    }

    const result = await handler({
      params: { acpSessionId, workspaceCwd, sessionId, workspaceId },
      context: {
        agentId: runtime.agentId,
        transport: runtime.transport,
        sessionBindings: sessionBindingRegistry,
        sessionOwnership,
        onSessionDiscovered,
        supportsCapability: (path) =>
          inventorySupportsRequiredCapability(runtime.capabilityInventory, path),
      },
    })

    if (result.ok && result.configOptions.length > 0) {
      onSessionConfig({
        agentId: runtime.agentId,
        acpSessionId: result.acpSessionId,
        configOptions: result.configOptions,
      })
    }

    return result
  }

  const closeAcpSession = async ({
    agentId,
    sessionId,
  }: {
    agentId: AgentId
    sessionId: string
  }): Promise<AcpSessionCloseResult> => {
    const runtime = getReadyRuntime(agentId)
    if (runtime === null || runtime.transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const handler = agentMethodTable.resolve({ agentId, method: "session/close" })
    if (handler === undefined) {
      return { ok: false, reason: "Agent does not support session/close" }
    }

    return handler({
      params: { acpSessionId: sessionId },
      context: {
        agentId,
        transport: runtime.transport,
        sessionBindings: sessionBindingRegistry,
        sessionOwnership,
        onSessionDiscovered,
        supportsCapability: (path) =>
          inventorySupportsRequiredCapability(runtime.capabilityInventory, path),
      },
    })
  }

  const startPromptAcpSession = async ({
    acpSessionId,
    prompt,
  }: {
    acpSessionId: string
    prompt: unknown
  }): Promise<AcpSessionPromptStartResult> => {
    const runtime = resolveRuntimeForAcpSession(acpSessionId)
    if (runtime === null || runtime.transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const handler = agentMethodTable.resolve({ agentId: runtime.agentId, method: "session/prompt" })
    if (handler === undefined) {
      return { ok: false, reason: "Agent does not support session/prompt" }
    }

    return handler({
      params: { acpSessionId, prompt },
      context: {
        agentId: runtime.agentId,
        transport: runtime.transport,
        sessionBindings: sessionBindingRegistry,
        sessionOwnership,
        onSessionDiscovered,
        supportsCapability: (path) =>
          inventorySupportsRequiredCapability(runtime.capabilityInventory, path),
      },
    })
  }

  const promptAcpSession = async ({
    acpSessionId,
    prompt,
  }: {
    acpSessionId: string
    prompt: unknown
  }): Promise<AcpSessionPromptResult> => {
    const started = await startPromptAcpSession({ acpSessionId, prompt })
    if (!started.ok) {
      return started
    }

    return started.completion
  }

  const cancelAcpSession = async ({
    acpSessionId,
  }: {
    acpSessionId: string
  }): Promise<AcpSessionCancelResult> => {
    const runtime = resolveRuntimeForAcpSession(acpSessionId)
    if (runtime === null || runtime.transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const handler = agentMethodTable.resolve({ agentId: runtime.agentId, method: "session/cancel" })
    if (handler === undefined) {
      return { ok: false, reason: "Agent does not support session/cancel" }
    }

    return handler({
      params: { acpSessionId },
      context: {
        agentId: runtime.agentId,
        transport: runtime.transport,
        sessionBindings: sessionBindingRegistry,
        sessionOwnership,
        onSessionDiscovered,
        supportsCapability: (path) =>
          inventorySupportsRequiredCapability(runtime.capabilityInventory, path),
      },
    })
  }

  const ensureSupervisorReadyForAgent = async (agentId: AgentId): Promise<boolean> => {
    if (getReadyRuntime(agentId) !== null) {
      return true
    }

    const startResult = await start(agentId)
    return startResult.ok && getReadyRuntime(agentId) !== null
  }

  const closeWorkspaceSessions = async ({
    sessions,
  }: {
    sessions: ReadonlyArray<LiveWorkspaceSession>
  }): Promise<CloseWorkspaceSessionsResult> => {
    const failures: CloseWorkspaceSessionFailure[] = []

    for (const session of sessions) {
      const ready = await ensureSupervisorReadyForAgent(session.agentId)
      if (!ready) {
        failures.push({
          acpSessionId: session.acpSessionId,
          reason: "ACP supervisor is not ready",
        })
        continue
      }

      const runtime = getReadyRuntime(session.agentId)
      const closeSupported = inventoryAdvertisesSessionClose(runtime?.capabilityInventory)
      if (!closeSupported) {
        sessionBindingRegistry.unbind({ acpSessionId: session.acpSessionId })
        sessionOwnership.forget({ acpSessionId: session.acpSessionId })
        continue
      }

      rememberAcpSession(session.agentId, session.acpSessionId)
      const result = await closeAcpSession({
        agentId: session.agentId,
        sessionId: session.acpSessionId,
      })
      if (!result.ok) {
        failures.push({
          acpSessionId: session.acpSessionId,
          reason: result.reason,
        })
      }
    }

    return { failures }
  }

  const unbindWorkspaceSessions = ({
    sessions,
  }: {
    sessions: ReadonlyArray<LiveWorkspaceSession>
  }): void => {
    sessions.forEach((session) => {
      sessionBindingRegistry.unbind({ acpSessionId: session.acpSessionId })
      sessionOwnership.forget({ acpSessionId: session.acpSessionId })
    })
  }

  const listLiveByWorkspaceRoot = (workspaceRoot: string): ReadonlyArray<LiveWorkspaceSession> =>
    sessionBindingRegistry.listByWorkspaceRoot(workspaceRoot).flatMap((binding) => {
      const agentId = sessionOwnership.ownerOf(binding.acpSessionId)
      if (agentId === undefined) {
        return []
      }
      return [{ acpSessionId: binding.acpSessionId, agentId }]
    })

  return {
    getRunningAgentId,
    getRunningAgentIds,
    getCapabilityInventory,
    getTransport,
    listLiveByWorkspaceRoot,
    listAcpSessions,
    createAcpSession,
    createSession,
    setConfigOption,
    loadSession,
    loadAcpSession,
    closeAcpSession,
    promptAcpSession,
    startPromptAcpSession,
    cancelAcpSession,
    closeWorkspaceSessions,
    unbindWorkspaceSessions,
  }
}
