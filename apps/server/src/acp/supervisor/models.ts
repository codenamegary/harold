import { AgentId, AgentSpawnSnapshot } from "contracts/http/agent-settings"
import { SessionConfig } from "contracts/http/config.options"
import { SupervisorAuthHooks } from "../../agent/auth/supervisor.hooks"
import { CapabilityInventory } from "../agent/inventory"
import { AgentProfile } from "../agent-profile"
import { JsonRpcTransport } from "../transport/json-rpc-transport"
import { SpawnedAgentProcess } from "./spawn.agent.process"
import { SessionBindingRegistry } from "../client/session-binding-registry"

export type AcpSupervisorState = "stopped" | "starting" | "ready" | "error"

export type AcpSupervisorStatus = {
  readonly state: AcpSupervisorState
  readonly activeSessions: number
}

export type AcpAgentRuntimeState = {
  readonly status: AcpSupervisorState
  readonly error: string | null
}

export type AcpSessionOperationResult =
  | { ok: true; acpSessionId: string; configOptions: SessionConfig }
  | { ok: false; reason: string; authRequired?: boolean }

export type AcpSetConfigOptionResult =
  | { ok: true; configOptions: SessionConfig }
  | {
      ok: false
      reason: string
      kind: "unknown-session" | "invalid-option" | "unsupported" | "error"
    }

export type SessionConfigHandler = (input: {
  agentId: AgentId
  acpSessionId: string
  configOptions: SessionConfig
}) => void

export type AcpSessionCloseResult = { ok: true } | { ok: false; reason: string }

export type AcpSessionPromptResult =
  | { ok: true; result: unknown }
  | { ok: false; reason: string; authRequired?: boolean }

export type AcpSessionPromptStartResult =
  | { ok: true; turnId: string; completion: Promise<AcpSessionPromptResult> }
  | { ok: false; reason: string; authRequired?: boolean }

export type AcpSessionCancelResult = { ok: true } | { ok: false; reason: string }

export type SessionUpdateHandler = (input: {
  agentId: AgentId
  acpSessionId: string
  update: unknown
}) => void

export type SessionDiscoveredHandler = (input: {
  agentId: AgentId
  sessionId: string
  cwd: string
}) => void

export type RequestPermissionFn = (input: {
  agentId: AgentId
  sessionId: string
  params: unknown
}) => Promise<unknown>

export type RequestExtensionRpcFn = (input: {
  agentId: AgentId
  sessionId: string
  method: string
  params: unknown
}) => Promise<unknown>

export type LiveWorkspaceSession = {
  readonly acpSessionId: string
  readonly agentId: AgentId
}

export type CloseWorkspaceSessionFailure = {
  readonly acpSessionId: string
  readonly reason: string
}

export type CloseWorkspaceSessionsResult = {
  readonly failures: ReadonlyArray<CloseWorkspaceSessionFailure>
}

export type AcpSession = {
  readonly agentId: AgentId
  readonly sessionId: string
  readonly cwd: string
  readonly title: string
  readonly updatedAt: string
}

export type AcpListSessionsResult =
  | { ok: true; sessions: ReadonlyArray<AcpSession> }
  | { ok: false; reason: string }

export type AcpSupervisor = {
  getStatus: () => AcpSupervisorStatus
  getAgentRuntimeState: (agentId: AgentId) => AcpAgentRuntimeState
  getRunningAgentId: () => AgentId | null
  getRunningAgentIds: () => ReadonlyArray<AgentId>
  getCapabilityInventory: (agentId: AgentId) => CapabilityInventory | null
  getTransport: (agentId?: AgentId) => JsonRpcTransport | null
  getSessionBindingRegistry: () => SessionBindingRegistry
  listLiveByWorkspaceRoot: (workspaceRoot: string) => ReadonlyArray<LiveWorkspaceSession>
  start: (agentId: AgentId) => Promise<AcpStartResult>
  stop: () => Promise<void>
  handleAgentDisabled: (agentId: AgentId) => Promise<void>
  respawn: (agentId: AgentId) => Promise<AcpStartResult>
  listAcpSessions: (params?: { cwd?: string }) => Promise<AcpListSessionsResult>
  createAcpSession: (params: {
    agentId?: AgentId
    workspaceCwd: string
    sessionId: string
    workspaceId: string
  }) => Promise<AcpSessionOperationResult>
  createSession: (params: { agentId: AgentId; cwd: string }) => Promise<AcpSessionOperationResult>
  setConfigOption: (params: {
    agentId: AgentId
    sessionId: string
    configId: string
    value: string | boolean
  }) => Promise<AcpSetConfigOptionResult>
  loadSession: (params: {
    agentId: AgentId
    sessionId: string
    cwd: string
  }) => Promise<AcpSessionOperationResult>
  loadAcpSession: (params: {
    acpSessionId: string
    workspaceCwd: string
    sessionId: string
    workspaceId: string
  }) => Promise<AcpSessionOperationResult>
  closeAcpSession: (params: {
    agentId: AgentId
    sessionId: string
  }) => Promise<AcpSessionCloseResult>
  promptAcpSession: (params: {
    acpSessionId: string
    prompt: unknown
  }) => Promise<AcpSessionPromptResult>
  startPromptAcpSession: (params: {
    acpSessionId: string
    prompt: unknown
  }) => Promise<AcpSessionPromptStartResult>
  cancelAcpSession: (params: { acpSessionId: string }) => Promise<AcpSessionCancelResult>
  closeWorkspaceSessions: (params: {
    sessions: ReadonlyArray<LiveWorkspaceSession>
  }) => Promise<CloseWorkspaceSessionsResult>
  unbindWorkspaceSessions: (params: { sessions: ReadonlyArray<LiveWorkspaceSession> }) => void
}

export type AgentSettingsReader = {
  list: () => ReadonlyArray<{
    id: AgentId
    enabled: boolean
    path: string | null
    args: string[]
  }>
  getSpawnSnapshot?: (agentId: AgentId) => AgentSpawnSnapshot | null
}

export const DEFAULT_ACP_RESTART_BACKOFF_MS = [250, 500, 1000, 2000, 4000] as const

export type CreateAcpSupervisorParams = {
  agentSettingsRepository: AgentSettingsReader
  serverVersion: string
  onSessionUpdate?: SessionUpdateHandler
  onSessionConfig?: SessionConfigHandler
  onSessionDiscovered?: SessionDiscoveredHandler
  requestPermission?: RequestPermissionFn
  requestExtensionRpc?: RequestExtensionRpcFn
  onBeforeClearRuntime?: () => void
  onSupervisorReady?: () => void | Promise<void>
  restartBackoffMs?: ReadonlyArray<number>
  sleepFn?: (ms: number) => Promise<void>
  spawnAgentProcessFn?: (input: {
    profile: AgentProfile
    executablePath: string
    args: readonly string[]
  }) => SpawnedAgentProcess
  createTransportFn?: (process: SpawnedAgentProcess) => JsonRpcTransport
  authHooks?: SupervisorAuthHooks
}

export type AcpStartResult = { ok: true } | { ok: false; reason: string }
