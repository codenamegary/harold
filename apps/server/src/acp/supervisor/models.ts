import { AgentId, AgentSpawnSnapshot } from "contracts/http/agent-settings"
import { SessionConfig } from "contracts/http/config.options"

/**
 * Data shapes and dependency records for the ACP supervisor. Atomic function
 * ports live in `./supervisor.ports`, the public capability record in
 * `./supervisor`, and the process driver adapter in `./supervisor.process.adapters`.
 */

/** Narrow read dependency over the agent settings slice. */
export type AgentSettingsReader = {
  list: () => ReadonlyArray<{
    id: AgentId
    enabled: boolean
    path: string | null
    args: string[]
  }>
  getSpawnSnapshot: (agentId: AgentId) => AgentSpawnSnapshot | null
}

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

/** Driver-agnostic shape of a spawned agent child process. */
export type SpawnedAgentProcess = {
  stdin: { write: (chunk: string) => void | number | Promise<void | number> }
  stdout: ReadableStream<Uint8Array>
  kill: () => void
  waitForExit: () => Promise<number | null>
}

export const DEFAULT_ACP_RESTART_BACKOFF_MS = [250, 500, 1000, 2000, 4000] as const

export type AcpStartResult = { ok: true } | { ok: false; reason: string }
