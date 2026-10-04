import { AgentSummary, AgentSummaryItem, StatusSummary } from "./status.summary.models"
import {
  GetAdvertisedEndpoint,
  GetAgentSummary,
  GetDataDir,
  GetLocalApi,
  GetWorkspaceCount,
} from "./status.summary.ports"

/**
 * Derives the agent summary from the agent-settings view. Only enabled
 * agents can need auth: a disabled agent is not running and cannot hold an
 * in-flight login. When any enabled agent has an unknown auth status, the
 * needs-auth count is reported as `null` instead of a misleading `0`.
 */
export const summarizeAgents = (items: readonly AgentSummaryItem[]): AgentSummary => {
  const enabledItems = items.filter((item) => item.enabled)

  if (enabledItems.length === 0) {
    return { enabled: 0, needsAuth: 0 }
  }

  if (enabledItems.some((item) => item.authSummary.status === "unknown")) {
    return { enabled: enabledItems.length, needsAuth: null }
  }

  return {
    enabled: enabledItems.length,
    needsAuth: enabledItems.filter((item) => item.authSummary.status === "needs_auth").length,
  }
}

export type GetStatusSummaryDeps = Readonly<{
  getDataDir: GetDataDir
  getLocalApi: GetLocalApi
  getAdvertisedEndpoint: GetAdvertisedEndpoint
  getAgentSummary: GetAgentSummary
  getWorkspaceCount: GetWorkspaceCount
}>

export type GetStatusSummary = () => StatusSummary

export const makeGetStatusSummary =
  (deps: GetStatusSummaryDeps): GetStatusSummary =>
  () => ({
    dataDir: deps.getDataDir(),
    localApi: deps.getLocalApi(),
    advertisedEndpoint: deps.getAdvertisedEndpoint(),
    agents: deps.getAgentSummary(),
    workspaces: deps.getWorkspaceCount(),
  })
