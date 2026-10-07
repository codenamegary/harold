import { AgentId } from "contracts/http/agent-settings"
import { registerSessionCancelHandler } from "../agent/session.cancel"
import { registerSessionCloseHandler } from "../agent/session.close"
import { registerSessionSetConfigOptionHandler } from "../agent/session.set.config.option"
import { registerSessionListHandler } from "../agent/session.list"
import { registerSessionLoadHandler } from "../agent/session.load"
import { registerSessionNewHandler } from "../agent/session.new"
import { registerSessionPromptHandler } from "../agent/session.prompt"
import { createAgentMethodTable } from "../agent/method.table"
import { createSessionOwnership } from "../agent/session.ownership"
import { SupervisorAuthHooks } from "../../agent/auth/supervisor.hooks"
import { CapabilityInventory } from "../agent/inventory"
import { JsonRpcTransport } from "../transport/json.rpc.transport"
import {
  createSessionBindingRegistry,
  SessionBindingRegistry,
} from "../client/session.binding.registry"
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
  AgentSettingsReader,
  CloseWorkspaceSessionsResult,
  LiveWorkspaceSession,
  RequestExtensionRpcFn,
  RequestPermissionFn,
  SessionConfigHandler,
  SessionDiscoveredHandler,
  SessionUpdateHandler,
  SpawnedAgentProcess,
} from "./models"
import { aggregateStatus } from "./supervisor.aggregate.status"
import { createSupervisorLifecycle } from "./supervisor.lifecycle"
import { SpawnAgentProcessFn } from "./supervisor.ports"
import { createSupervisorSessionOps } from "./supervisor.session.ops"

/**
 * Public capability record of the ACP supervisor: what other slices may call.
 * It lives with the composition root, not in the ports file, which holds only
 * atomic function ports. Data shapes live in `./models`.
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

/** Dependency bundle for the supervisor composition root. */
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
  spawnAgentProcessFn: SpawnAgentProcessFn
  createTransportFn?: (process: SpawnedAgentProcess) => JsonRpcTransport
  authHooks?: SupervisorAuthHooks
}

/**
 * Composition root for the ACP supervisor. Wires the process-lifecycle engine
 * (`supervisor.lifecycle.ts`) and the session operations
 * (`supervisor.session.ops.ts`) into the public `AcpSupervisor` capability.
 */
export const createAcpSupervisor = ({
  agentSettingsRepository,
  serverVersion,
  onSessionUpdate,
  onSessionConfig,
  onSessionDiscovered,
  requestPermission,
  requestExtensionRpc,
  logUnknownExtension,
  onBeforeClearRuntime,
  onSupervisorReady,
  restartBackoffMs,
  sleepFn,
  spawnAgentProcessFn,
  createTransportFn,
  authHooks,
}: CreateAcpSupervisorParams): AcpSupervisor => {
  const sessionBindingRegistry = createSessionBindingRegistry()
  const sessionOwnership = createSessionOwnership()
  const agentMethodTable = createAgentMethodTable()
  registerSessionCloseHandler(agentMethodTable)
  registerSessionSetConfigOptionHandler(agentMethodTable)
  registerSessionLoadHandler(agentMethodTable)
  registerSessionListHandler(agentMethodTable)
  registerSessionNewHandler(agentMethodTable)
  registerSessionPromptHandler(agentMethodTable)
  registerSessionCancelHandler(agentMethodTable)

  const lifecycle = createSupervisorLifecycle({
    agentSettingsRepository,
    serverVersion,
    sessionBindingRegistry,
    sessionOwnership,
    onSessionUpdate,
    requestPermission,
    requestExtensionRpc,
    logUnknownExtension,
    onBeforeClearRuntime,
    onSupervisorReady,
    restartBackoffMs,
    sleepFn,
    spawnAgentProcessFn,
    createTransportFn,
    authHooks,
  })
  const { runtimes, start, stop, respawn, handleAgentDisabled, getAgentRuntimeState } = lifecycle

  const sessionOps = createSupervisorSessionOps({
    runtimes,
    sessionBindingRegistry,
    sessionOwnership,
    agentMethodTable,
    onSessionDiscovered,
    onSessionConfig,
    start,
  })

  return {
    getStatus: (): AcpSupervisorStatus =>
      aggregateStatus(
        [...runtimes.values()].map((runtime) => runtime.state),
        sessionBindingRegistry.count(),
      ),
    getAgentRuntimeState,
    getSessionBindingRegistry: () => sessionBindingRegistry,
    start,
    stop,
    handleAgentDisabled,
    respawn,
    ...sessionOps,
  }
}
