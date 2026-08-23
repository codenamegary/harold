import { AgentAuthStatus } from "contracts/http/agent-auth"

export const agentAuthStatusLabels: Record<AgentAuthStatus, string> = {
  unknown: "auth unknown",
  needs_auth: "needs auth",
  authenticated: "signed in",
  error: "auth error",
}

export const agentAuthStatusChipClassName: Record<AgentAuthStatus, string> = {
  unknown: "border-line-soft text-dim",
  needs_auth: "border-amber-400/40 text-amber-200",
  authenticated: "border-lime/40 text-lime",
  error: "border-red-400/40 text-red-400",
}
