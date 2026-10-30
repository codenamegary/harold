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

/**
 * The URL the host uses to reach its own daemon. Wildcard binds are not
 * dialable, so they map to the matching loopback address.
 */
export const localApiUrl = (api: LocalApi): string => {
  const host = api.host === "0.0.0.0" ? "127.0.0.1" : api.host === "::" ? "::1" : api.host
  const formattedHost = host.includes(":") ? `[${host}]` : host
  return `http://${formattedHost}:${api.port}`
}

export type StatusSummary = Readonly<{
  dataDir: string
  localApi: LocalApi
  agents: AgentSummary
  workspaces: number
}>
