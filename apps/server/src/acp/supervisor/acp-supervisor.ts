import { AgentId } from "contracts/http/agent-settings"
import { resolveAgentProfile } from "../agent-profile"
import { sanitizeAcpErrorMessage } from "../sanitize-acp-error"
import {
  AgentCapabilities,
  AgentSettingsReader,
  AcpSessionCloseResult,
  AcpSessionOperationResult,
  AcpSupervisor,
  AcpSupervisorState,
  AcpSupervisorStatus,
  CloseWorkspaceSessionFailure,
  CloseWorkspaceSessionsResult,
  CreateAcpSupervisorParams,
  createAcpStartError,
  LiveWorkspaceSession,
} from "./acp-supervisor-types"
import { createJsonRpcTransport, JsonRpcTransport } from "../transport/json-rpc-transport"
import { registerAcpClientHandlers } from "../client/register-handlers"
import { createSessionBindingRegistry } from "../client/session-binding-registry"
import { spawnAgentProcess, SpawnedAgentProcess } from "./spawn-agent-process"

type SupervisorRuntime = {
  state: AcpSupervisorState
  runningAgentId: AgentId | null
  agentCapabilities: AgentCapabilities | null
  process: SpawnedAgentProcess | null
  transport: JsonRpcTransport | null
  exitMonitor: Promise<void> | null
}

const statusFromState = (state: AcpSupervisorState): AcpSupervisorStatus => ({
  state,
  activeSessions: 0,
})

const sanitizeFailureReason = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : fallback
  return sanitizeAcpErrorMessage(message)
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

export const createAcpSupervisor = ({
  agentSettingsRepository,
  serverVersion,
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
    runtime.transport?.close()
    runtime.process?.kill()
    runtime.transport = null
    runtime.process = null
    runtime.exitMonitor = null
    runtime.runningAgentId = null
    runtime.agentCapabilities = null
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

      registerAcpClientHandlers({
        transport,
        profile: resolved.profile,
        sessionBindingRegistry,
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
  }: {
    workspaceCwd: string
  }): Promise<AcpSessionOperationResult> => {
    const transport = runtime.transport
    if (runtime.state !== "ready" || transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    try {
      const result = await transport.request<{ sessionId: string }>("session/new", {
        cwd: workspaceCwd,
        mcpServers: [],
      })

      sessionBindingRegistry.bind({
        acpSessionId: result.sessionId,
        workspaceRoot: workspaceCwd,
      })

      return { ok: true, acpSessionId: result.sessionId }
    } catch (error: unknown) {
      return { ok: false, reason: sanitizeFailureReason(error, "session/new failed") }
    }
  }

  const loadAcpSession = async ({
    acpSessionId,
    workspaceCwd,
  }: {
    acpSessionId: string
    workspaceCwd: string
  }): Promise<AcpSessionOperationResult> => {
    const transport = runtime.transport
    const capabilities = runtime.agentCapabilities

    if (runtime.state !== "ready" || transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    if (!capabilities?.loadSession) {
      return { ok: false, reason: "Agent does not support session/load" }
    }

    try {
      const result = await transport.request<{ sessionId: string }>("session/load", {
        sessionId: acpSessionId,
        cwd: workspaceCwd,
        mcpServers: [],
      })

      sessionBindingRegistry.unbind({ acpSessionId })
      sessionBindingRegistry.bind({
        acpSessionId: result.sessionId,
        workspaceRoot: workspaceCwd,
      })

      return { ok: true, acpSessionId: result.sessionId }
    } catch (error: unknown) {
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

    if (runtime.state !== "ready" || transport === null) {
      return { ok: false, reason: "ACP supervisor is not ready" }
    }

    if (!capabilities?.sessionCapabilities.close) {
      return { ok: false, reason: "Agent does not support session/close" }
    }

    try {
      await transport.request("session/close", { sessionId: acpSessionId })
      sessionBindingRegistry.unbind({ acpSessionId })
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, reason: sanitizeFailureReason(error, "session/close failed") }
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
    getStatus: () => statusFromState(runtime.state),
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
    closeWorkspaceSessions,
    unbindWorkspaceSessions,
  }
}
