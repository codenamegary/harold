import { Status } from "contracts/http/status"
import { ConnectionPhase } from "../connection/connectionPhase"
import { formatUptime } from "./formatUptime"

type RelayState = Status["state"]

type ServerStatusDisplay = {
  value: string
  pill: string | null
  uptime: string | null
}

const relayStateLabels: Record<RelayState, string> = {
  starting: "Starting",
  online: "Online",
  shutting_down: "Shutting down",
  offline: "Offline",
}

const relayStatePillLabels: Record<RelayState, string> = {
  starting: "Starting",
  online: "Healthy",
  shutting_down: "Shutting down",
  offline: "Offline",
}

export const serverStatusDisplay = (
  phase: ConnectionPhase,
  state: RelayState | null,
  uptimeSeconds: number | null,
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

  if (state === null || uptimeSeconds === null) {
    return {
      value: "Checking…",
      pill: null,
      uptime: null,
    }
  }

  return {
    value: relayStateLabels[state],
    pill: relayStatePillLabels[state],
    uptime: formatUptime(uptimeSeconds),
  }
}
