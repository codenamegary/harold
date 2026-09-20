import { AgentId, AgentSpawnSnapshot } from "contracts/http/agent-settings"
import { SupervisorAuthHooks } from "../../agent/auth/supervisor.hooks"
import { CapabilityInventory } from "../agent/inventory"
import { AgentProfile } from "../agent.profile"
import { JsonRpcTransport } from "../transport/json.rpc.transport"
import { SessionBindingRegistry } from "../client/session.binding.registry"
import {
  AcpAgentRuntimeState,
  AcpListSessionsResult,
  AcpSessionCancelResult,
  AcpSessionCloseResult,
  AcpSessionOperationResult,
  AcpSessionPromptResult,
  AcpSessionPromptStartResult,
  AcpSetConfigOptionResult,
  AcpStartResult,
  AcpSupervisorStatus,
  CloseWorkspaceSessionsResult,
  LiveWorkspaceSession,
  RequestExtensionRpcFn,
  RequestPermissionFn,
  SessionConfigHandler,
  SessionDiscoveredHandler,
  SessionUpdateHandler,
  SpawnedAgentProcess,
} from "./models"

/**
 * Public capability port of the ACP supervisor: what other slices may call.
 * Data shapes live in `./models`.
 */
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

/** Narrow read port over the agent settings slice. */
export type AgentSettingsReader = {
  list: () => ReadonlyArray<{
    id: AgentId
    enabled: boolean
    path: string | null
    args: string[]
  }>
  getSpawnSnapshot?: (agentId: AgentId) => AgentSpawnSnapshot | null
}

/** Port satisfied by the process adapter (`supervisor.process.adapters.ts`). */
export type SpawnAgentProcessFn = (input: {
  profile: AgentProfile
  executablePath: string
  args: readonly string[]
}) => SpawnedAgentProcess

export type CreateAcpSupervisorParams = {
  agentSettingsRepository: AgentSettingsReader
  serverVersion: string
  onSessionUpdate?: SessionUpdateHandler
  onSessionConfig?: SessionConfigHandler
  onSessionDiscovered?: SessionDiscoveredHandler
  requestPermission?: RequestPermissionFn
  requestExtensionRpc?: RequestExtensionRpcFn
  /** Called when an agent sends an extension method with no registered handler. */
  logUnknownExtension?: (method: string) => void
  onBeforeClearRuntime?: () => void
  onSupervisorReady?: () => void | Promise<void>
  restartBackoffMs?: ReadonlyArray<number>
  sleepFn?: (ms: number) => Promise<void>
  spawnAgentProcessFn?: SpawnAgentProcessFn
  createTransportFn?: (process: SpawnedAgentProcess) => JsonRpcTransport
  authHooks?: SupervisorAuthHooks
}
