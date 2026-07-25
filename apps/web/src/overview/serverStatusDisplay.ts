import { AgentServerState } from "contracts/http/status"
import { ConnectionPhase } from "../connection/connectionPhase"
import { formatUptime } from "./formatUptime"

type ServerStatusDisplay = {
  value: string
  pill: string | null
  uptime: string | null
}

const agentServerStateLabels: Record<AgentServerState, string> = {
  starting: "Starting",
  online: "Online",
  shutting_down: "Shutting down",
  offline: "Offline",
}

const agentServerStatePillLabels: Record<AgentServerState, string> = {
  starting: "Starting",
  online: "Healthy",
  shutting_down: "Shutting down",
  offline: "Offline",
}

export const serverStatusDisplay = (
  phase: ConnectionPhase,
  state: AgentServerState | null,
  elapsedSeconds: number | null,
): ServerStatusDisplay => {
  if (phase === "loading") {
    return {
      value: "Checking…",
      pill: null,
      uptime: null,
    }
  }

  if (phase === "unreachable") {
    return {
      value: "Unreachable",
      pill: null,
      uptime: null,
    }
  }

  if (state === null || elapsedSeconds === null) {
    return {
      value: "Checking…",
      pill: null,
      uptime: null,
    }
  }

  return {
    value: agentServerStateLabels[state],
    pill: agentServerStatePillLabels[state],
    uptime: formatUptime(elapsedSeconds),
  }
}
