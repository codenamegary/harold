import { AgentRuntimeState } from "contracts/http/agent-settings"

export const agentRuntimeStatusLabels: Record<AgentRuntimeState["status"], string> = {
  stopped: "stopped",
  starting: "starting",
  ready: "ready",
  error: "error",
}

export const agentRuntimeStatusChipClassName: Record<AgentRuntimeState["status"], string> = {
  stopped: "border-line-soft text-dim",
  starting: "border-amber/40 text-amber",
  ready: "border-lime/40 text-lime",
  error: "border-danger/40 text-danger",
}
