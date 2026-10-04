import { Status } from "contracts/http/status"
import { DaemonNotRunning } from "core/daemon-state/read.live.usecase"

export type StatusColors = Readonly<{
  green: (text: string) => string
  yellow: (text: string) => string
  red: (text: string) => string
}>

const stateColor = (status: Status, colors: StatusColors): ((text: string) => string) => {
  const colorByState: Record<Status["state"], (text: string) => string> = {
    online: colors.green,
    starting: colors.yellow,
    shutting_down: colors.yellow,
    offline: colors.red,
  }
  return colorByState[status.state]
}

const padLabel = (label: string, width: number): string => label.padEnd(width)

export const renderDaemonStatus = (params: {
  status: Status
  pid: number
  colors: StatusColors
}): string => {
  const { status, pid, colors } = params
  const colorState = stateColor(status, colors)
  const rows: Array<[string, string]> = [
    ["version", status.version],
    ["local api", `http://${status.bindAddress}:${status.port}`],
    ["started", status.startedAt],
    ["acp", `${status.acp.state}, ${status.acp.activeSessions} active session(s)`],
  ]
  const labelWidth = Math.max(...rows.map(([label]) => label.length))

  const lines = [
    `Harold daemon is ${colorState(status.state)} (pid ${pid})`,
    "",
    ...rows.map(([label, value]) => `  ${padLabel(label, labelWidth)}  ${value}`),
  ]
  return lines.join("\n")
}

export const renderDaemonNotRunning = (error: DaemonNotRunning): string => {
  if (error.kind === "process_not_alive") {
    return `Harold is not running (stale state file from pid ${error.pid}).`
  }
  if (error.kind === "unreadable_state_file") {
    return `Harold state file is unreadable: ${error.detail}`
  }
  return "Harold is not running."
}
