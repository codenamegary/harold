import { AgentId } from "contracts/http/agent-settings"
import {
  AgentAuthStatus,
  AuthSessionAction,
  AuthStepV1,
} from "contracts/http/agent-auth"

export type AuthCompletionPolicy = "reconnect" | "reuse_process"

export type AdapterAuthContext = {
  agentId: AgentId
  hostIdentity: { id: "default" }
  hostMachineName: string
  initializeResult?: unknown
}

export type AuthAdapterProbeResult = {
  status: AgentAuthStatus
  error: string | null
  canLogout: boolean
}

export type AuthAdapter = {
  id: string
  matches: (agentId: AgentId) => boolean
  clientAuthCapabilities: (ctx: AdapterAuthContext) => Record<string, unknown>
  hostLoginInstructions: (ctx: AdapterAuthContext) => string
  probe: (ctx: AdapterAuthContext) => Promise<AuthAdapterProbeResult>
  onStart: (ctx: AdapterAuthContext) => Promise<void>
  completionPolicy: AuthCompletionPolicy
  start: (
    ctx: AdapterAuthContext,
    input: { sessionId: string; retry: boolean },
  ) => Promise<{ steps: AuthStepV1[] }>
  continue: (
    ctx: AdapterAuthContext,
    input: {
      sessionId: string
      action: Extract<AuthSessionAction, { type: "confirm" }>
    },
  ) => Promise<{ steps: AuthStepV1[] }>
  abort: (ctx: AdapterAuthContext, input: { sessionId: string }) => Promise<void>
  logout: (ctx: AdapterAuthContext) => Promise<void>
}
