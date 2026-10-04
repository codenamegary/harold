import {
  GetAdvertisedEndpoint,
  GetAgentSummary,
  GetDataDir,
  GetLocalApi,
  GetWorkspaceCount,
} from "core/status/summary.ports"
import { summarizeAgents } from "core/status/summary.usecase"
import { probePresence } from "../acp/catalog/probe.presence"
import { makeAgentSettingsView } from "../agent-settings/agent.settings.view"
import { makeListAgentSettings } from "../agent-settings/agent.settings.list.usecase"
import { makeListAgentSettingsRows } from "../agent-settings/agent.settings.sqlite.adapters"
import { validateExecutablePath } from "../agent-settings/validate-agent-path"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { Config } from "../config/config"
import { readEnvBindOverrides } from "../config/env.bind.overrides"
import { AgentDatabase } from "../persistence/database"
import { buildAppliedRuntimeSettings } from "../runtime-settings/resolve.runtime.settings.state"
import {
  makeRuntimeSettingsFileStore,
  seedDefaultsFromConfig,
} from "../runtime-settings/runtime-settings.file.adapters"
import { makeCountWorkspaces } from "./status.summary.sqlite.adapters"

export type ComposeStatusSummaryPortsDeps = Readonly<{
  database: AgentDatabase
  config: Config
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
 * Adapts the server's persisted state (settings.yml, agent-settings rows,
 * workspace rows) into the core status-summary ports. The CLI composes the
 * core use case over these ports in process against the same data dir
 * (ADR-0006). The agent summary uses the static view: the daemon-only auth
 * broker holds live auth state, so `needsAuth` is `null` (unknown) while the
 * daemon is not the caller. It is never reported as a definitive `0` from
 * this unknown source.
 */
export const composeStatusSummaryPorts = (
  deps: ComposeStatusSummaryPortsDeps,
): StatusSummaryPorts => {
  const env = deps.env ?? process.env
  const whichFn: WhichFn = deps.whichFn ?? ((name) => Bun.which(name))
  const settingsStore = makeRuntimeSettingsFileStore({
    dataDir: deps.config.dataDir,
    seedDefaults: seedDefaultsFromConfig(deps.config),
  })
  const buildView = makeAgentSettingsView({
    probePresence: (agentId, spawn) => probePresence(agentId, { which: whichFn, env }, spawn),
    validatePath: validateExecutablePath,
  })
  const listAgentSettings = makeListAgentSettings({
    listRows: makeListAgentSettingsRows(deps.database),
    buildView,
  })

  return {
    getDataDir: () => deps.config.dataDir,
    getLocalApi: () => {
      const applied = buildAppliedRuntimeSettings({
        persisted: settingsStore.get(),
        envOverrides: readEnvBindOverrides(env),
      })
      return { host: applied.bindHost, port: applied.bindPort }
    },
    getAdvertisedEndpoint: () => {
      const settings = settingsStore.get()
      return { url: settings.advertisedUrl, enabled: settings.advertisedUrlEnabled }
    },
    getAgentSummary: () => summarizeAgents(listAgentSettings()),
    getWorkspaceCount: makeCountWorkspaces(deps.database),
  }
}
