import { AgentId } from "contracts/http/agent-settings"
import { FailureCode } from "contracts/events/primitives"
import { JOURNAL_SCHEMA_VERSION, JournalAppendRecord } from "contracts/events/journal-record"
import { resolveAgentProfile } from "../agent-profile"
import { sanitizeAcpRejection } from "../sanitize-acp-error"
import {
  AgentCapabilities,
  AgentSettingsReader,
  AcpSessionCloseResult,
  AcpSessionCancelResult,
  AcpSessionOperationResult,
  AcpSessionPromptResult,
  AcpSessionPromptStartResult,
  AcpSupervisor,
  AcpSupervisorState,
  AcpSupervisorStatus,
  CloseWorkspaceSessionFailure,
  CloseWorkspaceSessionsResult,
  CreateAcpSupervisorParams,
  createAcpStartError,
  LiveWorkspaceSession,
} from "./acp-supervisor-types"
import { isAcpJsonRpcError } from "../transport/json-rpc-error"
import { AcpOperationContext, createJsonRpcTransport, JsonRpcTransport } from "../transport/json-rpc-transport"
import { registerAcpClientHandlers } from "../client/register-handlers"
import { createSessionBindingRegistry } from "../client/session-binding-registry"
import { spawnAgentProcess, SpawnedAgentProcess } from "./spawn-agent-process"
import { createAcpJsonRpcJournalObserver } from "../journal/json.rpc.observer"
import {
  mapSanitizedErrorToFailureCode,
  sanitizeOperatorPromptText,
} from "../journal/sanitize.acp.update"
import { createTurnId } from "../../session/create.turn.id"

type SupervisorRuntime = {
  state: AcpSupervisorState
  runningAgentId: AgentId | null
  agentCapabilities: AgentCapabilities | null
  process: SpawnedAgentProcess | null
  transport: JsonRpcTransport | null
  exitMonitor: Promise<void> | null
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

const parseAgentCapabilities = (result: unknown): AgentCapabilities => {
  const value = result as {
    agentCapabilities?: {
      loadSession?: boolean
      sessionCapabilities?: { close?: boolean }
    }
  }

  return {
    loadSession: value.agentCapabilities?.loadSession ?? false,
    sessionCapabilities: {
      close: value.agentCapabilities?.sessionCapabilities?.close ?? false,
    },
  }
}

const parsePromptStopReason = (result: unknown): string | undefined => {
  const value = result as { stopReason?: string }
  return value.stopReason
}

const resolveStartConfig = (
  repository: AgentSettingsReader,
  agentId: AgentId,
) => {
  const profile = resolveAgentProfile(agentId)
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
  }
}

const monitorProcessExit = async (
  runtime: SupervisorRuntime,
  process: SpawnedAgentProcess,
  onUnexpectedExit: () => void,
) => {
  const exitCode = await process.waitForExit()
  if (runtime.process !== process) {
    return
  }

  if (exitCode !== 0 && exitCode !== null) {
    onUnexpectedExit()
  }
}

const wireTransportObserver = (
  transport: JsonRpcTransport,
  journalWriter: NonNullable<CreateAcpSupervisorParams["journalWriter"]>,
  sessionBindingRegistry: ReturnType<typeof createSessionBindingRegistry>,
) => {
  const observer = createAcpJsonRpcJournalObserver({
    journalWriter,
    sessionBindingRegistry,
  })
  transport.onObserverEvent(observer)
}

export const createAcpSupervisor = ({
  agentSettingsRepository,
  serverVersion,
  journalWriter,
  onSessionUpdate = () => undefined,
  onBeforeClearRuntime = () => undefined,
  spawnAgentProcessFn = spawnAgentProcess,
  createTransportFn = (process) =>
    createJsonRpcTransport({
      stdin: process.stdin,
      stdout: process.stdout,
    }),
}: CreateAcpSupervisorParams): AcpSupervisor => {
  const sessionBindingRegistry = createSessionBindingRegistry()
  const runtime: SupervisorRuntime = {
    state: "stopped",
    runningAgentId: null,
    agentCapabilities: null,
    process: null,
    transport: null,
    exitMonitor: null,
  }

  const clearRuntime = () => {
    onBeforeClearRuntime()
    runtime.transport?.close()
    runtime.process?.kill()
    runtime.transport = null
    runtime.process = null
    runtime.exitMonitor = null
    runtime.runningAgentId = null
    runtime.agentCapabilities = null
    sessionBindingRegistry.clear()
  }

  const transitionToError = () => {
    clearRuntime()
    runtime.state = "error"
  }

  const stop = async (): Promise<void> => {
    clearRuntime()
    runtime.state = "stopped"
  }

  const start = async (agentId: AgentId): Promise<void> => {
    if (runtime.state === "starting") {
      throw createAcpStartError("ACP supervisor is already starting")
    }

    if (runtime.state === "ready" && runtime.runningAgentId === agentId) {
      return
    }

    await stop()

    const resolved = resolveStartConfig(agentSettingsRepository, agentId)
    if (!resolved.ok) {
      runtime.state = "stopped"
      throw createAcpStartError(resolved.reason)
    }

    runtime.state = "starting"

    try {
      const process = spawnAgentProcessFn({
        profile: resolved.profile,
        executablePath: resolved.executablePath,
      })
      const transport = createTransportFn(process)

      runtime.process = process
      runtime.transport = transport
      runtime.runningAgentId = agentId

      if (journalWriter !== undefined) {
        wireTransportObserver(transport, journalWriter, sessionBindingRegistry)
      }

      registerAcpClientHandlers({
        transport,
        profile: resolved.profile,
        sessionBindingRegistry,
      })

      transport.onNotification("session/update", (params) => {
        const value = params as { sessionId?: string; update?: unknown }
        if (value.sessionId === undefined) {
          return
        }

        onSessionUpdate({
          acpSessionId: value.sessionId,
          update: value.update,
        })
      })

      runtime.exitMonitor = monitorProcessExit(runtime, process, transitionToError)

      const initResult = await transport.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: resolved.profile.clientCapabilities,
        clientInfo: { name: "agent-server", version: serverVersion },
      })

      runtime.agentCapabilities = parseAgentCapabilities(initResult)

      await transport.request("authenticate", {
        methodId: resolved.profile.authMethodId,
      })

      runtime.state = "ready"
    } catch (error: unknown) {
      transitionToError()
      throw createAcpStartError(sanitizeFailureReason(error, "ACP supervisor failed to start"))
    }
  }

  const handleAgentDisabled = async (agentId: AgentId): Promise<void> => {
    if (runtime.runningAgentId === agentId) {
      await stop()
    }
  }

  const createAcpSession = async ({
    workspaceCwd,
    sessionId,
    workspaceId,
  }: {
    workspaceCwd: string
    sessionId: string
    workspaceId: string
  }): Promise<AcpSessionOperationResult> => {
    const transport = runtime.transport
    if (runtime.state !== "ready" || transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const operationContext: AcpOperationContext = {
      sessionId,
      workspaceId,
      phase: "live",
    }

    try {
      const result = await transport.request<{ sessionId: string }>(
        "session/new",
        {
          cwd: workspaceCwd,
          mcpServers: [],
        },
        operationContext,
      )

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
    const transport = runtime.transport
    const capabilities = runtime.agentCapabilities

    if (runtime.state !== "ready" || transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    if (!capabilities?.loadSession) {
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

    const operationContext: AcpOperationContext = {
      sessionId,
      workspaceId,
      phase: "load_replay",
    }

    try {
      const result = await transport.request<{ sessionId: string }>(
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

      return { ok: true, acpSessionId: result.sessionId }
    } catch (error: unknown) {
      sessionBindingRegistry.setPhase({ acpSessionId, phase: "live" })
      return { ok: false, reason: sanitizeFailureReason(error, "session/load failed") }
    }
  }

  const closeAcpSession = async ({
    acpSessionId,
  }: {
    acpSessionId: string
  }): Promise<AcpSessionCloseResult> => {
    const transport = runtime.transport
    const capabilities = runtime.agentCapabilities
    const binding = sessionBindingRegistry.getBinding(acpSessionId)

    if (runtime.state !== "ready" || transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    if (!capabilities?.sessionCapabilities.close) {
      return { ok: false, reason: "Agent does not support session/close" }
    }

    const operationContext: AcpOperationContext | undefined =
      binding === undefined
        ? undefined
        : {
            sessionId: binding.sessionId,
            workspaceId: binding.workspaceId,
            phase: binding.phase,
          }

    try {
      await transport.request("session/close", { sessionId: acpSessionId }, operationContext)
      sessionBindingRegistry.unbind({ acpSessionId })
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, reason: sanitizeFailureReason(error, "session/close failed") }
    }
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

  const terminalTurnIds = new Set<string>()

  const appendTurnLifecycle = (params: {
    binding: NonNullable<ReturnType<typeof sessionBindingRegistry.getBinding>>
    turnId: string
    kind: "turn.started" | "turn.completed" | "turn.failed" | "turn.cancelled"
    failureCode?: FailureCode
  }) => {
    if (terminalTurnIds.has(params.turnId)) {
      return { ok: true as const }
    }

    if (journalWriter === undefined) {
      return { ok: true as const }
    }

    const occurredAt = nowIso()
    const baseRecord = {
      schemaVersion: 1 as const,
      occurredAt,
      workspaceId: params.binding.workspaceId,
      sessionId: params.binding.sessionId,
      turnId: params.turnId,
    }

    const records: JournalAppendRecord[] =
      params.kind === "turn.failed"
        ? [
            {
              ...baseRecord,
              kind: "turn.failed",
              payload: {
                failureCode: params.failureCode ?? "agent_error",
              },
            },
          ]
        : params.kind === "turn.started"
          ? [{ ...baseRecord, kind: "turn.started", payload: { text: "" } }]
          : params.kind === "turn.completed"
            ? [{ ...baseRecord, kind: "turn.completed", payload: {} }]
            : [{ ...baseRecord, kind: "turn.cancelled", payload: {} }]

    const result = journalWriter.appendAndPublish(records)
    if (result.ok && params.kind !== "turn.started") {
      terminalTurnIds.add(params.turnId)
    }

    return result
  }

  const startPromptAcpSession = async ({
    acpSessionId,
    prompt,
  }: {
    acpSessionId: string
    prompt: unknown
  }): Promise<AcpSessionPromptStartResult> => {
    const transport = runtime.transport
    if (runtime.state !== "ready" || transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const bound = requireBoundSession(acpSessionId)
    if (!bound.ok) {
      return bound
    }

    const turnId = createTurnId()
    const promptRequestId = transport.allocateRequestId()
    const operationContext: AcpOperationContext = {
      sessionId: bound.binding.sessionId,
      workspaceId: bound.binding.workspaceId,
      turnId,
      phase: bound.binding.phase,
    }

    if (journalWriter !== undefined) {
      const transactional = journalWriter.runTransactional((params) => {
        const appendResult = params.append([
          {
            schemaVersion: JOURNAL_SCHEMA_VERSION,
            kind: "turn.started",
            occurredAt: nowIso(),
            workspaceId: bound.binding.workspaceId,
            sessionId: bound.binding.sessionId,
            turnId,
            payload: { text: sanitizeOperatorPromptText(prompt) },
          },
          {
            schemaVersion: JOURNAL_SCHEMA_VERSION,
            kind: "acp.request",
            occurredAt: nowIso(),
            workspaceId: bound.binding.workspaceId,
            sessionId: bound.binding.sessionId,
            turnId,
            protocolVersion: 1,
            direction: "agent_server_to_agent",
            method: "session/prompt",
            phase: bound.binding.phase,
            payload: { jsonRpcId: promptRequestId },
          },
        ])

        if (!appendResult.ok) {
          return appendResult
        }

        return { ok: true, value: undefined, appendedRecords: appendResult.value }
      })

      if (!transactional.ok) {
        return { ok: false, reason: "Failed to journal turn start" }
      }
    }

    sessionBindingRegistry.setActiveTurnId({ acpSessionId, turnId })

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

        const stopReason = parsePromptStopReason(result)
        if (stopReason === "cancelled") {
          appendTurnLifecycle({ binding: bound.binding, turnId, kind: "turn.cancelled" })
        } else if (stopReason === "end_turn") {
          appendTurnLifecycle({ binding: bound.binding, turnId, kind: "turn.completed" })
        } else {
          appendTurnLifecycle({
            binding: bound.binding,
            turnId,
            kind: "turn.failed",
            failureCode: "prompt_failed",
          })
        }

        sessionBindingRegistry.setActiveTurnId({ acpSessionId, turnId: undefined })
        return { ok: true, result }
      } catch (error: unknown) {
        const reason = sanitizeFailureReason(error, "session/prompt failed")
        appendTurnLifecycle({
          binding: bound.binding,
          turnId,
          kind: "turn.failed",
          failureCode: mapSanitizedErrorToFailureCode(reason),
        })
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
    const transport = runtime.transport
    if (runtime.state !== "ready" || transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    const bound = requireBoundSession(acpSessionId)
    if (!bound.ok) {
      return bound
    }

    try {
      transport.notify("session/cancel", { sessionId: acpSessionId })
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, reason: sanitizeFailureReason(error, "session/cancel failed") }
    }
  }

  const ensureSupervisorReadyForAgent = async (agentId: AgentId): Promise<boolean> => {
    if (runtime.state === "ready" && runtime.runningAgentId === agentId) {
      return true
    }

    try {
      await start(agentId)
      return runtime.state === "ready"
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

      const closeSupported = runtime.agentCapabilities?.sessionCapabilities.close === true
      if (!closeSupported) {
        sessionBindingRegistry.unbind({ acpSessionId: session.acpSessionId })
        continue
      }

      const result = await closeAcpSession({ acpSessionId: session.acpSessionId })
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
    })
  }

  return {
    getStatus: (): AcpSupervisorStatus => ({
      state: runtime.state,
      activeSessions: sessionBindingRegistry.count(),
    }),
    getRunningAgentId: () => runtime.runningAgentId,
    getAgentCapabilities: () => runtime.agentCapabilities,
    getTransport: () => runtime.transport,
    getSessionBindingRegistry: () => sessionBindingRegistry,
    start,
    stop,
    handleAgentDisabled,
    createAcpSession,
    loadAcpSession,
    closeAcpSession,
    promptAcpSession,
    startPromptAcpSession,
    cancelAcpSession,
    closeWorkspaceSessions,
    unbindWorkspaceSessions,
  }
}
