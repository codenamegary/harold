import { AgentRuntimeState } from "contracts/http/agent-settings"

export const agentRuntimeStatusLabels: Record<AgentRuntimeState["status"], string> = {
  stopped: "stopped",
  starting: "starting",
  ready: "ready",
  error: "error",
}

export const agentRuntimeStatusChipClassName: Record<AgentRuntimeState["status"], string> = {
  stopped: "border-line-soft text-dim",
  starting: "border-amber-400/40 text-amber-200",
  ready: "border-lime/40 text-lime",
  error: "border-red-400/40 text-red-400",
}
