import { AgentId } from "contracts/http/agent-settings"
import { resolveAgentProfile } from "../agent-profile"
import { sanitizeAcpRejection } from "../sanitize-acp-error"
import { buildCapabilityInventory, CapabilityInventory } from "../agent/inventory"
import { agentMethodDeclarations } from "../agent/method.declarations"
import { createAgentMethodTable } from "../agent/method.table"
import { registerSessionCloseHandler } from "../agent/session.close"
import { createSessionOwnership } from "../agent/session.ownership"
import {
  AgentSettingsReader,
  AcpSession,
  AcpListSessionsResult,
  AcpSessionCloseResult,
  AcpSessionCancelResult,
  AcpSessionOperationResult,
  AcpSessionPromptResult,
  AcpSessionPromptStartResult,
  AcpSupervisor,
  AcpSupervisorState,
  AcpSupervisorStatus,
  AcpAgentRuntimeState,
  CloseWorkspaceSessionFailure,
  CloseWorkspaceSessionsResult,
  CreateAcpSupervisorParams,
  createAcpStartError,
  DEFAULT_ACP_RESTART_BACKOFF_MS,
  LiveWorkspaceSession,
} from "./models"
import { isAcpJsonRpcError } from "../transport/json-rpc-error"
import { AcpOperationContext, createJsonRpcTransport, JsonRpcTransport } from "../transport/json-rpc-transport"
import { registerAcpClientHandlers, createUnavailableRequestExtensionRpc, createUnavailableRequestPermission } from "../client/register-handlers"
import { resolveExtensionHandlers } from "../client/extensions/extension.handlers"
import { createSessionBindingRegistry } from "../client/session-binding-registry"
import { spawnAgentProcess, SpawnedAgentProcess } from "./spawn.agent.process"
import { createTurnId } from "../../session/create.turn.id"
import {
  inventoryAdvertisesResumable,
  inventoryAdvertisesSessionClose,
  inventoryAdvertisesSessionList,
  inventorySupportsRequiredCapability,
} from "../agent/inventory"

type SupervisorRuntime = {
  agentId: AgentId
  state: AcpSupervisorState
  lastError: string | null
  capabilityInventory: CapabilityInventory | null
  process: SpawnedAgentProcess | null
  transport: JsonRpcTransport | null
  exitMonitor: Promise<void> | null
  acceptUnexpectedExit: boolean
  restartGeneration: number
}

const nowIso = (): string => new Date().toISOString()

const sanitizeFailureReason = (error: unknown, fallback: string): string => {
  if (isAcpJsonRpcError(error)) {
    return sanitizeAcpRejection({
      message: error.message,
      data: error.data,
    })
  }

  const message = error instanceof Error ? error.message : fallback
  return sanitizeAcpRejection({ message })
}

const parseListedSessions = (result: unknown): ReadonlyArray<{
  sessionId: string
  cwd: string
  title: string
  updatedAt: string
}> => {
  const value = result as {
    sessions?: ReadonlyArray<{
      sessionId?: string
      cwd?: string
      title?: string
      updatedAt?: string
    }>
  }

  if (!Array.isArray(value.sessions)) {
    return []
  }

  return value.sessions.flatMap((session) => {
    if (session.sessionId === undefined) {
      return []
    }

    return [
      {
        sessionId: session.sessionId,
        cwd: session.cwd ?? "",
        title: session.title ?? session.sessionId,
        updatedAt: session.updatedAt ?? nowIso(),
      },
    ]
  })
}

const resolveStartConfig = (
  repository: AgentSettingsReader,
  agentId: AgentId,
) => {
  const spawnSnapshot = repository.getSpawnSnapshot?.(agentId) ?? null
  const profile = resolveAgentProfile(agentId, spawnSnapshot)
  if (!profile) {
    return { ok: false as const, reason: "Agent profile is not available" }
  }

  const settings = repository.list().find((agent) => agent.id === agentId)
  if (!settings?.enabled) {
    return { ok: false as const, reason: "Agent is not enabled" }
  }

  if (!settings.path) {
    return { ok: false as const, reason: "Agent executable path is not configured" }
  }

  return {
    ok: true as const,
    profile,
    executablePath: settings.path,
    args: settings.args,
  }
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
})

const aggregateStatus = (
  runtimes: Map<AgentId, SupervisorRuntime>,
  activeSessions: number,
): AcpSupervisorStatus => {
  if (runtimes.size === 0) {
    return { state: "stopped", activeSessions }
  }

  const states = [...runtimes.values()].map((runtime) => runtime.state)
  if (states.some((state) => state === "ready")) {
    return { state: "ready", activeSessions }
  }
  if (states.some((state) => state === "starting")) {
    return { state: "starting", activeSessions }
  }
  if (states.some((state) => state === "error")) {
    return { state: "error", activeSessions }
  }
  return { state: "stopped", activeSessions }
}

export const createAcpSupervisor = ({
  agentSettingsRepository,
  serverVersion,
  onSessionUpdate = () => undefined,
  onSessionDiscovered = () => undefined,
  requestPermission = createUnavailableRequestPermission(),
  requestExtensionRpc = createUnavailableRequestExtensionRpc(),
  onBeforeClearRuntime = () => undefined,
  onSupervisorReady = () => undefined,
  restartBackoffMs = DEFAULT_ACP_RESTART_BACKOFF_MS,
  sleepFn = defaultSleep,
  spawnAgentProcessFn = spawnAgentProcess,
  createTransportFn = (process) =>
    createJsonRpcTransport({
      stdin: process.stdin,
      stdout: process.stdout,
    }),
}: CreateAcpSupervisorParams): AcpSupervisor => {
  const sessionBindingRegistry = createSessionBindingRegistry()
  const sessionOwnership = createSessionOwnership()
  const agentMethodTable = createAgentMethodTable()
  registerSessionCloseHandler(agentMethodTable)
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
      throw createAcpStartError("ACP supervisor runtime is not available")
    }

    const resolved = resolveStartConfig(agentSettingsRepository, agentId)
    if (!resolved.ok) {
      throw createAcpStartError(resolved.reason)
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

    const initResult = await transport.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: resolved.profile.clientCapabilities,
      clientInfo: { name: "agent-server", version: serverVersion },
    })

    runtime.capabilityInventory = buildCapabilityInventory({
      initializeResult: initResult,
      declarations: agentMethodDeclarations,
    })

    await transport.request("authenticate", {
      methodId: resolved.profile.authMethodId,
    })

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

  const start = async (agentId: AgentId): Promise<void> => {
    const existing = runtimes.get(agentId)
    if (existing?.state === "starting") {
      throw createAcpStartError("ACP supervisor is already starting")
    }

    if (existing?.state === "ready") {
      return
    }

    if (existing !== undefined) {
      await stopRuntime(agentId)
    }

    const resolved = resolveStartConfig(agentSettingsRepository, agentId)
    if (!resolved.ok) {
      throw createAcpStartError(resolved.reason)
    }

    const runtime = createEmptyRuntime(agentId)
    runtime.state = "starting"
    runtimes.set(agentId, runtime)

    try {
      await spawnAndInitialize(agentId)
    } catch (error: unknown) {
      const reason = sanitizeFailureReason(error, "ACP supervisor failed to start")
      transitionToError(agentId, reason)
      throw createAcpStartError(reason)
    }
  }

  const handleAgentDisabled = async (agentId: AgentId): Promise<void> => {
    if (runtimes.get(agentId) === undefined) {
      return
    }
    await stopRuntime(agentId)
  }

  const respawn = async (agentId: AgentId): Promise<void> => {
    await stopRuntime(agentId)
    await start(agentId)
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
        const error = runtime.lastError
        if (error === null) {
          throw new Error("ACP error runtime is missing lastError")
        }
        return { status: "error", error }
      }
    }
  }

  const getReadyRuntime = (agentId: AgentId): SupervisorRuntime | null => {
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

  const resolveRuntimeForAcpSession = (acpSessionId: string): SupervisorRuntime | null => {
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

    const operationContext: AcpOperationContext = {
      sessionId,
      workspaceId,
      phase: "live",
    }

    try {
      const result = await runtime.transport.request<{ sessionId: string }>(
        "session/new",
        {
          cwd: workspaceCwd,
          mcpServers: [],
        },
        operationContext,
      )

      rememberAcpSession(resolvedAgentId, result.sessionId)
      sessionBindingRegistry.bind({
        acpSessionId: result.sessionId,
        sessionId,
        workspaceId,
        workspaceRoot: workspaceCwd,
        phase: "live",
      })

      return { ok: true, acpSessionId: result.sessionId }
    } catch (error: unknown) {
      return { ok: false, reason: sanitizeFailureReason(error, "session/new failed") }
    }
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

    try {
      const result = await runtime.transport.request<{ sessionId: string }>("session/new", {
        cwd,
        mcpServers: [],
      })

      rememberAcpSession(agentId, result.sessionId)
      sessionBindingRegistry.bind({
        acpSessionId: result.sessionId,
        sessionId: result.sessionId,
        workspaceId: result.sessionId,
        workspaceRoot: cwd,
        phase: "live",
      })
      onSessionDiscovered({
        agentId,
        sessionId: result.sessionId,
        cwd,
      })
      return { ok: true, acpSessionId: result.sessionId }
    } catch (error: unknown) {
      return { ok: false, reason: sanitizeFailureReason(error, "session/new failed") }
    }
  }

  const listAcpSessions = async (params?: {
    cwd?: string
  }): Promise<AcpListSessionsResult> => {
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

          const listed = parseListedSessions(
            await transport.request(
              "session/list",
              params?.cwd === undefined ? {} : { cwd: params.cwd },
            ),
          )

          return listed.flatMap((session) => {
            if (params?.cwd !== undefined && session.cwd !== params.cwd) {
              return []
            }

            rememberAcpSession(runtime.agentId, session.sessionId)
            onSessionDiscovered({
              agentId: runtime.agentId,
              sessionId: session.sessionId,
              cwd: session.cwd,
            })
            return [
              {
                agentId: runtime.agentId,
                sessionId: session.sessionId,
                cwd: session.cwd,
                title: session.title,
                updatedAt: session.updatedAt,
              },
            ]
          })
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

    const existingBinding = sessionBindingRegistry.getBinding(acpSessionId)
    if (existingBinding !== undefined && existingBinding.phase === "live") {
      return { ok: true, acpSessionId }
    }

    if (!inventoryAdvertisesResumable(runtime.capabilityInventory)) {
      return { ok: false, reason: "Agent does not support session/load" }
    }

    sessionBindingRegistry.unbind({ acpSessionId })
    sessionBindingRegistry.bind({
      acpSessionId,
      sessionId,
      workspaceId,
      workspaceRoot: workspaceCwd,
      phase: "load_replay",
    })
    rememberAcpSession(runtime.agentId, acpSessionId)

    const operationContext: AcpOperationContext = {
      sessionId,
      workspaceId,
      phase: "load_replay",
    }

    try {
      const result = await runtime.transport.request<{ sessionId: string }>(
        "session/load",
        {
          sessionId: acpSessionId,
          cwd: workspaceCwd,
          mcpServers: [],
        },
        operationContext,
      )

      sessionBindingRegistry.unbind({ acpSessionId: result.sessionId })
      sessionBindingRegistry.bind({
        acpSessionId: result.sessionId,
        sessionId,
        workspaceId,
        workspaceRoot: workspaceCwd,
        phase: "live",
      })
      rememberAcpSession(runtime.agentId, result.sessionId)

      return { ok: true, acpSessionId: result.sessionId }
    } catch (error: unknown) {
      sessionBindingRegistry.unbind({ acpSessionId })
      return { ok: false, reason: sanitizeFailureReason(error, "session/load failed") }
    }
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

  const requireBoundSession = (
    acpSessionId: string,
  ): { ok: true; binding: NonNullable<ReturnType<typeof sessionBindingRegistry.getBinding>> } | { ok: false; reason: string } => {
    const binding = sessionBindingRegistry.getBinding(acpSessionId)
    if (binding === undefined) {
      return { ok: false as const, reason: "Session is not bound" }
    }

    return { ok: true as const, binding }
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

    const bound = requireBoundSession(acpSessionId)
    if (!bound.ok) {
      return bound
    }

    const turnId = createTurnId()
    const promptRequestId = runtime.transport.allocateRequestId()
    const operationContext: AcpOperationContext = {
      sessionId: bound.binding.sessionId,
      workspaceId: bound.binding.workspaceId,
      turnId,
      phase: bound.binding.phase,
    }

    sessionBindingRegistry.setActiveTurnId({ acpSessionId, turnId })

    const transport = runtime.transport
    const completion = (async (): Promise<AcpSessionPromptResult> => {
      try {
        const result = await transport.request(
          "session/prompt",
          {
            sessionId: acpSessionId,
            prompt,
          },
          operationContext,
          { requestId: promptRequestId },
        )

        sessionBindingRegistry.setActiveTurnId({ acpSessionId, turnId: undefined })
        return { ok: true, result }
      } catch (error: unknown) {
        const reason = sanitizeFailureReason(error, "session/prompt failed")
        sessionBindingRegistry.setActiveTurnId({ acpSessionId, turnId: undefined })
        return { ok: false, reason }
      }
    })()

    return { ok: true, turnId, completion }
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

    const bound = requireBoundSession(acpSessionId)
    if (!bound.ok) {
      return bound
    }

    try {
      runtime.transport.notify("session/cancel", { sessionId: acpSessionId })
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, reason: sanitizeFailureReason(error, "session/cancel failed") }
    }
  }

  const ensureSupervisorReadyForAgent = async (agentId: AgentId): Promise<boolean> => {
    if (getReadyRuntime(agentId) !== null) {
      return true
    }

    try {
      await start(agentId)
      return getReadyRuntime(agentId) !== null
    } catch {
      return false
    }
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

  const listLiveByWorkspaceRoot = (
    workspaceRoot: string,
  ): ReadonlyArray<LiveWorkspaceSession> =>
    sessionBindingRegistry.listByWorkspaceRoot(workspaceRoot).flatMap((binding) => {
      const agentId = sessionOwnership.ownerOf(binding.acpSessionId)
      if (agentId === undefined) {
        return []
      }
      return [{ acpSessionId: binding.acpSessionId, agentId }]
    })

  return {
    getStatus: (): AcpSupervisorStatus =>
      aggregateStatus(runtimes, sessionBindingRegistry.count()),
    getAgentRuntimeState,
    getRunningAgentId: () => resolveReadyAgentId(),
    getRunningAgentIds: () =>
      [...runtimes.values()]
        .filter((runtime) => runtime.state === "ready")
        .map((runtime) => runtime.agentId),
    getCapabilityInventory: (agentId) =>
      getReadyRuntime(agentId)?.capabilityInventory ?? null,
    getTransport: (agentId) => {
      const resolvedAgentId = resolveReadyAgentId(agentId)
      if (resolvedAgentId === null) {
        return null
      }
      return getReadyRuntime(resolvedAgentId)?.transport ?? null
    },
    getSessionBindingRegistry: () => sessionBindingRegistry,
    listLiveByWorkspaceRoot,
    start,
    stop,
    handleAgentDisabled,
    respawn,
    listAcpSessions,
    createAcpSession,
    createSession,
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
