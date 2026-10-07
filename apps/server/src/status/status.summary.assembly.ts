import {
  GetAdvertisedEndpoint,
  GetAgentSummary,
  GetDataDir,
  GetLocalApi,
  GetWorkspaceCount,
} from "core/status/summary.ports"
import { summarizeAgents } from "core/status/summary.usecase"
import { probePresence } from "core/agent-catalog/probe.presence"
import { makeAgentSettingsView } from "core/agent-settings/view"
import { makeListAgentSettings } from "core/agent-settings/list.usecase"
import { ListAgentSettingsRows } from "core/agent-settings/ports"
import { validateExecutablePath } from "core/agent-settings/validate-agent-path"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { Config } from "../config/config"
import { readEnvBindOverrides } from "../config/env.bind.overrides"
import { AgentDatabase } from "../persistence/database"
import { buildAppliedRuntimeSettings } from "../runtime-settings/resolve.runtime.settings.state"
import { GetRuntimeSettings } from "../runtime-settings/runtime-settings.ports"
import { makeCountWorkspaces } from "./status.summary.sqlite.adapters"

export type ComposeStatusSummaryPortsDeps = Readonly<{
  config: Config
  database: AgentDatabase
  getRuntimeSettings: GetRuntimeSettings
  listAgentSettingsRows: ListAgentSettingsRows
  env?: Readonly<Record<string, string | undefined>>
  whichFn?: WhichFn
}>

export type StatusSummaryPorts = Readonly<{
  getDataDir: GetDataDir
  getLocalApi: GetLocalApi
  getAdvertisedEndpoint: GetAdvertisedEndpoint
  getAgentSummary: GetAgentSummary
  getWorkspaceCount: GetWorkspaceCount
}>

/**
 * Assembles the server's persisted state (settings.yml, agent-settings rows,
 * workspace rows) into the core status-summary ports. The runtime settings
 * store and the agent-settings rows arrive as injected ports so this slice
 * never imports another slice's adapters; the CLI composes the same use case
 * over these ports in process against the same data dir (ADR-0006). The agent
 * summary uses the static view: the daemon-only auth broker holds live auth
 * state, so `needsAuth` is `null` (unknown) while the daemon is not the
 * caller. It is never reported as a definitive `0` from this unknown source.
 */
export const composeStatusSummaryPorts = (
  deps: ComposeStatusSummaryPortsDeps,
): StatusSummaryPorts => {
  const env = deps.env ?? process.env
  const whichFn: WhichFn = deps.whichFn ?? ((name) => Bun.which(name))
  const buildView = makeAgentSettingsView({
    probePresence: (agentId, spawn) => probePresence(agentId, { which: whichFn, env }, spawn),
    validatePath: validateExecutablePath,
  })
  const listAgentSettings = makeListAgentSettings({
    listRows: deps.listAgentSettingsRows,
    buildView,
  })

  return {
    getDataDir: () => deps.config.dataDir,
    getLocalApi: () => {
      const applied = buildAppliedRuntimeSettings({
        persisted: deps.getRuntimeSettings(),
        envOverrides: readEnvBindOverrides(env),
      })
      return { host: applied.bindHost, port: applied.bindPort }
    },
    getAdvertisedEndpoint: () => {
      const settings = deps.getRuntimeSettings()
      return { url: settings.advertisedUrl, enabled: settings.advertisedUrlEnabled }
    },
    getAgentSummary: () => summarizeAgents(listAgentSettings()),
    getWorkspaceCount: makeCountWorkspaces(deps.database),
  }
}
