import { AgentId } from "contracts/http/agent-settings"
import { SessionBindingRegistry } from "../client/session-binding-registry"
import {
  AcpListSessionsResult,
  AcpSessionCancelResult,
  AcpSessionCloseResult,
  AcpSessionOperationResult,
  AcpSessionPromptStartResult,
  SessionDiscoveredHandler,
} from "../supervisor/acp-supervisor-types"
import { JsonRpcTransport } from "../transport/json-rpc-transport"

export const ANY_AGENT = "*"

export type AgentFilter = AgentId

export type CapabilityPath = string

export const agentMethodNames = [
  "session/new",
  "session/prompt",
  "session/cancel",
  "session/load",
  "session/list",
  "session/close",
] as const

export type AgentMethodName = (typeof agentMethodNames)[number]

export type AgentMethodDeclaration = {
  method: AgentMethodName
  requires: CapabilityPath | null
}

export type SessionOwnership = {
  remember: (params: { agentId: AgentId; acpSessionId: string }) => void
  forget: (params: { acpSessionId: string }) => void
  ownerOf: (acpSessionId: string) => AgentId | undefined
  sessionsOwnedBy: (agentId: AgentId) => ReadonlyArray<string>
}

export type AgentMethodHandlerContext = {
  agentId: AgentId
  transport: JsonRpcTransport
  sessionBindings: SessionBindingRegistry
  sessionOwnership: SessionOwnership
  onSessionDiscovered: SessionDiscoveredHandler
  supportsCapability: (path: CapabilityPath) => boolean
}

export type AgentMethodSignatures = {
  "session/new": {
    params: { workspaceCwd: string; sessionId: string; workspaceId: string }
    result: AcpSessionOperationResult
  }
  "session/prompt": {
    params: { acpSessionId: string; prompt: unknown }
    result: AcpSessionPromptStartResult
  }
  "session/cancel": {
    params: { acpSessionId: string }
    result: AcpSessionCancelResult
  }
  "session/load": {
    params: {
      acpSessionId: string
      workspaceCwd: string
      sessionId: string
      workspaceId: string
    }
    result: AcpSessionOperationResult
  }
  "session/list": {
    params: { cwd?: string }
    result: AcpListSessionsResult
  }
  "session/close": {
    params: { sessionId: string }
    result: AcpSessionCloseResult
  }
}

export type AgentMethodHandler<M extends AgentMethodName> = (input: {
  params: AgentMethodSignatures[M]["params"]
  context: AgentMethodHandlerContext
}) => Promise<AgentMethodSignatures[M]["result"]>

export type AgentMethodRegistration<M extends AgentMethodName> = {
  agentId: AgentFilter
  method: M
  handler: AgentMethodHandler<M>
}
