import { AgentId, AgentSettings } from "contracts/http/agent-settings"
import { AttachmentReference } from "contracts/http/attachments"
import { AcpStartResult } from "../acp/supervisor/models"

/**
 * Atomic capability ports for the session slice. Adapters satisfy these
 * function signatures; use cases and routes depend only on the types here.
 */

// Agent settings lookup
export type FindAgentSettings = (agentId: AgentId) => AgentSettings | undefined

// ACP supervisor lifecycle
export type GetRunningAgentIds = () => ReadonlyArray<AgentId>

export type StartAcpAgent = (agentId: AgentId) => Promise<AcpStartResult>

export type EnsureSupervisorReadyResult = { ok: true } | { ok: false; reason: string }

export type EnsureSupervisorReady = (agentId: AgentId) => Promise<EnsureSupervisorReadyResult>

export type AdvertisesSessionClose = (agentId: AgentId) => boolean

export type CloseAcpSession = (params: {
  agentId: AgentId
  sessionId: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

// Hub session ports (supervisor-facing)
export type SessionHubLoadSession = (params: {
  agentId: AgentId
  sessionId: string
  cwd: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

export type SessionHubPromptSession = (params: {
  agentId: AgentId
  sessionId: string
  text: string
  attachments?: ReadonlyArray<AttachmentReference>
}) => Promise<{ ok: true } | { ok: false; reason: string; authRequired?: boolean }>

export type SessionHubCancelSession = (params: {
  agentId: AgentId
  sessionId: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

// Archived ACP sessions store
export type ArchivedAcpSessionKey = {
  agentId: AgentId
  sessionId: string
}

export type ArchiveAcpSession = (params: ArchivedAcpSessionKey) => void

export type IsArchivedAcpSession = (params: ArchivedAcpSessionKey) => boolean

// Prompt auth gating
export type EnsureReadyForPrompt = (agentId: AgentId) => Promise<{ ok: true } | { ok: false }>

export type EnsureSessionFromChallenge = (agentId: AgentId) => Promise<void>
