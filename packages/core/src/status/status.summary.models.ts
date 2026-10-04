import { AgentAuthStatus } from "contracts/http/agent-auth"

/**
 * `needsAuth` is `null` when the auth state for an enabled agent is unknown
 * (for example the static persisted view, which has no live auth broker). A
 * definitive `0` must never be reported from an unknown source.
 */
export type AgentSummary = Readonly<{
  enabled: number
  needsAuth: number | null
}>

/**
 * Structural slice of the agent-settings view the summary derives from, so
 * core does not depend on the full wire shape of an agent setting.
 */
export type AgentSummaryItem = Readonly<{
  enabled: boolean
  authSummary: Readonly<{ status: AgentAuthStatus }>
}>

export type LocalApi = Readonly<{
  host: string
  port: number
}>

export type AdvertisedEndpoint = Readonly<{
  url: string | null
  enabled: boolean
}>

export type StatusSummary = Readonly<{
  dataDir: string
  localApi: LocalApi
  advertisedEndpoint: AdvertisedEndpoint
  agents: AgentSummary
  workspaces: number
}>
