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
}) => Promise<{ ok: true } | { ok: false; reason: string; authRequired?: boolean }>

/** Outcome of a full prompt turn. */
export type SessionPromptOutcome =
  | { ok: true }
  | { ok: false; reason: string; authRequired?: boolean }

/**
 * Runs a full prompt turn to completion: resolves attachment blocks, sends
 * `session/prompt`, and resolves with the turn outcome. Failures are values,
 * never exceptions.
 */
export type SessionPromptTurn = (params: {
  agentId: AgentId
  sessionId: string
  text: string
  attachments?: ReadonlyArray<AttachmentReference>
}) => Promise<SessionPromptOutcome>

/**
 * Bind upsert for prompts: guarantees the session is bound to a running agent,
 * loading it when needed. An already-bound session is left untouched. Fails
 * only when the binding cannot be established.
 */
export type EnsureSessionBound = (params: {
  agentId: AgentId
  sessionId: string
  cwd: string
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

// Agent-pushed session titles
export type SessionTitleKey = {
  agentId: AgentId
  sessionId: string
}

export type GetSessionTitle = (params: SessionTitleKey) => string | undefined

export type RememberSessionTitle = (params: SessionTitleKey & { title: string }) => void

export type ForgetSessionTitle = (params: SessionTitleKey) => void

export type BroadcastSessionTitle = (params: SessionTitleKey & { title: string | null }) => void

// Prompt auth gating
export type EnsureReadyForPrompt = (agentId: AgentId) => Promise<{ ok: true } | { ok: false }>

export type EnsureSessionFromChallenge = (agentId: AgentId) => Promise<void>

/** Why a session command (prompt/cancel) was refused. */
export type SessionCommandError =
  | { readonly kind: "unknown_session"; readonly reason: string }
  | { readonly kind: "auth_gated"; readonly reason: string }
  | { readonly kind: "rejected"; readonly reason: string }
