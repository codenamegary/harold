import { AgentId } from "contracts/http/agent-settings"
import { AgentProfile } from "./agent-profile"
import { JsonRpcTransport } from "./json-rpc-transport"
import { SpawnedAgentProcess } from "./spawn-agent-process"

export type AcpSupervisorState = "stopped" | "starting" | "ready" | "error"

export type AgentCapabilities = {
  readonly loadSession: boolean
  readonly sessionCapabilities: {
    readonly close: boolean
  }
}

export type AcpSupervisorStatus = {
  readonly state: AcpSupervisorState
  readonly activeSessions: number
}

export type AcpSupervisor = {
  getStatus: () => AcpSupervisorStatus
  getRunningAgentId: () => AgentId | null
  getAgentCapabilities: () => AgentCapabilities | null
  start: (agentId: AgentId) => Promise<void>
  stop: () => Promise<void>
  handleAgentDisabled: (agentId: AgentId) => Promise<void>
}

export type AgentSettingsReader = {
  list: () => ReadonlyArray<{
    id: AgentId
    enabled: boolean
    path: string | null
  }>
}

export type CreateAcpSupervisorParams = {
  agentSettingsRepository: AgentSettingsReader
  serverVersion: string
  spawnAgentProcessFn?: (input: {
    profile: AgentProfile
    executablePath: string
  }) => SpawnedAgentProcess
  createTransportFn?: (process: SpawnedAgentProcess) => JsonRpcTransport
}

export type AcpStartError = Error & { readonly name: "AcpStartError" }

export const createAcpStartError = (message: string): AcpStartError => {
  const error = new Error(message) as AcpStartError
  error.name = "AcpStartError"
  return error
}

export const isAcpStartError = (error: unknown): error is AcpStartError =>
  error instanceof Error && error.name === "AcpStartError"
