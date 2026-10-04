import { Status } from "contracts/http/status"
import { DaemonNotRunning, ReadLiveDaemonStateResult } from "core/daemon-state/read.live.usecase"
import { StatusSummary } from "core/status/summary.models"

export type StatusColors = Readonly<{
  green: (text: string) => string
  yellow: (text: string) => string
  red: (text: string) => string
  dim: (text: string) => string
  bold: (text: string) => string
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

const renderRows = (rows: Array<[string, string]>): string => {
  const labelWidth = Math.max(...rows.map(([label]) => label.length))
  return rows.map(([label, value]) => `  ${padLabel(label, labelWidth)}  ${value}`).join("\n")
}

const formatAdvertisedEndpoint = (endpoint: { url: string | null; enabled: boolean }): string => {
  if (endpoint.url === null) {
    return "disabled"
  }
  return endpoint.enabled ? endpoint.url : `${endpoint.url} (disabled)`
}

const formatAgentSummary = (agents: StatusSummary["agents"]): string => {
  const needsAuth = agents.needsAuth === null ? "unknown" : `${agents.needsAuth}`
  return `${agents.enabled} enabled, ${needsAuth} needs auth`
}

export const renderStatusSummary = (summary: StatusSummary): string =>
  renderRows([
    ["data dir", summary.dataDir],
    ["local api", `http://${summary.localApi.host}:${summary.localApi.port}`],
    ["advertised endpoint", formatAdvertisedEndpoint(summary.advertisedEndpoint)],
    ["agents", formatAgentSummary(summary.agents)],
    ["workspaces", String(summary.workspaces)],
  ])

export const renderDaemonNotRunning = (error: DaemonNotRunning): string => {
  if (error.kind === "process_not_alive") {
    return `Harold is not running (stale state file from pid ${error.pid}).`
  }
  if (error.kind === "unreadable_state_file") {
    return `Harold state file is unreadable: ${error.detail}`
  }
  return "Harold is not running."
}

export type RenderStatusParams = Readonly<{
  summary: StatusSummary
  daemon: ReadLiveDaemonStateResult
  colors: StatusColors
}>

export const renderStatus = (params: RenderStatusParams): string => {
  const sections = [params.colors.bold("Harold"), "", renderStatusSummary(params.summary)]

  if (params.daemon.ok) {
    const { status, pid } = params.daemon.state
    const colorState = stateColor(status, params.colors)
    sections.push(
      "",
      params.colors.bold("Daemon"),
      "",
      renderRows([
        ["status", `${colorState(status.state)} (pid ${pid})`],
        ["version", status.version],
        ["started", status.startedAt],
        ["acp", `${status.acp.state}, ${status.acp.activeSessions} active session(s)`],
      ]),
    )
  } else {
    sections.push(
      "",
      params.colors.bold("Daemon"),
      "",
      `  ${params.colors.dim(renderDaemonNotRunning(params.daemon.error))}`,
    )
  }

  return sections.join("\n")
}
