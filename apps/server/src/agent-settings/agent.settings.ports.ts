import {
  AgentId,
  AgentSettings,
  AgentSpawnSnapshot,
} from "contracts/http/agent-settings"

export type AgentSettingsRow = Readonly<{
  agentId: string
  enabled: boolean
  path: string | null
  args: string | null
  spawnSnapshot: string | null
  updatedAt: string
}>

export type AgentSettingsRowInput = Readonly<{
  agentId: string
  enabled: boolean
  path: string | null
  args: string | null
  spawnSnapshot: string | null
  updatedAt: string
}>

export type AgentSettingsRowPatch = Readonly<{
  agentId?: string
  enabled?: boolean
  path?: string | null
  args?: string | null
  spawnSnapshot?: string | null
  updatedAt?: string
}>

export type ListAgentSettingsRows = () => ReadonlyArray<AgentSettingsRow>

export type FindAgentSettingsRow = (
  agentId: string,
) => AgentSettingsRow | undefined

export type InsertAgentSettingsRow = (input: AgentSettingsRowInput) => void

export type UpdateAgentSettingsRow = (input: {
  agentId: string
  patch: AgentSettingsRowPatch
}) => void

export type DeleteAgentSettingsRow = (agentId: string) => void

export type PresenceProbeOutcome = Readonly<{
  present: boolean
  path: string | null
}>

export type ProbeAgentPresence = (
  agentId: AgentId,
  spawn: AgentSpawnSnapshot | undefined,
) => PresenceProbeOutcome

export type BuildAgentSettingsView = (
  agentId: AgentId,
  row: AgentSettingsRow | undefined,
) => AgentSettings

export type FetchRegistryFn = (url: string) => Promise<unknown>

export const defaultAcpRegistryUrl =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"
