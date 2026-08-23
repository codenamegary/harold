import { AgentAuthStatus } from "contracts/http/agent-auth"

export const agentAuthStatusLabels: Record<AgentAuthStatus, string> = {
  unknown: "auth unknown",
  needs_auth: "needs auth",
  authenticated: "signed in",
  error: "auth error",
}

export const agentAuthStatusTextClassName: Record<AgentAuthStatus, string> = {
  unknown: "text-dim",
  needs_auth: "text-amber-200",
  authenticated: "text-lime",
  error: "text-red-400",
}
