import { StatusSummary } from "core/status/summary.models"
import { makeGetStatusSummary } from "core/status/summary.usecase"
import { Config } from "server/config"
import { openDatabase } from "server/database"
import { assembleDeviceSlice } from "server/device"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { makeListAgentSettingsRows } from "server/agent-settings/sqlite-adapters"
import { composeStatusSummaryPorts } from "server/status-summary"
import { renderStatusSummary } from "./status.render"

/**
 * What the CLI knows about a running daemon after it is up: the persisted
 * status summary plus the paired device count. Serve and setup print it once
 * the listener answers, and derive the next recommended command from it.
 */
export type RunningView = Readonly<{
  summary: StatusSummary
  devices: number
}>

export type NextStep = Readonly<{
  command: string
  description: string
}>

export type RunningViewColors = Readonly<{
  bold: (text: string) => string
  dim: (text: string) => string
}>

export const recommendNextStep = (view: RunningView): NextStep => {
  if (view.summary.agents.enabled === 0 || view.summary.workspaces === 0) {
    return { command: "harold setup", description: "configure agents, a workspace, and pairing" }
  }

  const endpoint = view.summary.advertisedEndpoint
  if (endpoint.url === null || !endpoint.enabled) {
    return { command: "harold connect", description: "verify a reachable endpoint for your phone" }
  }

  if (view.devices === 0) {
    return { command: "harold pair", description: "pair a device" }
  }

  return { command: "harold status", description: "see live daemon and configuration state" }
}

export const renderRunningView = (view: RunningView, colors: RunningViewColors): string => {
  const next = recommendNextStep(view)

  return [
    colors.bold("Harold is running"),
    "",
    renderStatusSummary(view.summary),
    "",
    colors.bold("Next step"),
    "",
    `  ${next.command}    ${colors.dim(next.description)}`,
  ].join("\n")
}

/**
 * Reads the running view in process against the same data dir the daemon
 * uses (ADR-0006). The database handle is short lived: serve and setup call
 * this after the listener is confirmed, then print the block.
 */
export const readRunningView = (config: Config): RunningView => {
  const database = openDatabase({ dataDir: config.dataDir })

  try {
    const settingsStore = makeRuntimeSettingsFileStore({
      dataDir: config.dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })
    const getStatusSummary = makeGetStatusSummary(
      composeStatusSummaryPorts({
        config,
        database,
        getRuntimeSettings: settingsStore.get,
        listAgentSettingsRows: makeListAgentSettingsRows(database),
      }),
    )
    const devices = assembleDeviceSlice({
      database,
      loopbackEndpoint: `http://${config.host}:${config.port}`,
      getAdvertisedEndpointSettings: () => {
        const settings = settingsStore.get()
        return {
          advertisedUrl: settings.advertisedUrl,
          advertisedUrlEnabled: settings.advertisedUrlEnabled,
        }
      },
    }).listDevices({ limit: 1 })

    return { summary: getStatusSummary(), devices: devices.ok ? devices.value.count : 0 }
  } finally {
    database.close()
  }
}
