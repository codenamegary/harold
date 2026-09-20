import { AgentId } from "contracts/http/agent-settings"
import { AttachmentReference } from "contracts/http/attachments"
import {
  EnsureReadyForPrompt,
  EnsureSessionFromChallenge,
  SessionHubPromptSession,
} from "./session.ports"

export type PromptAuthGateError =
  | { readonly kind: "AUTH_GATED" }
  | { readonly kind: "PROMPT_FAILED"; readonly reason: string }

export type PromptAuthGateResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: PromptAuthGateError }

export type PromptAuthGateInput = Readonly<{
  agentId: AgentId
  sessionId: string
  text: string
  attachments?: ReadonlyArray<AttachmentReference>
}>

export type PromptAuthGateDeps = Readonly<{
  promptSession: SessionHubPromptSession
  ensureReadyForPrompt?: EnsureReadyForPrompt
  ensureSessionFromChallenge?: EnsureSessionFromChallenge
}>

export type PromptAuthGate = (input: PromptAuthGateInput) => Promise<PromptAuthGateResult>

/**
 * Decides how a prompt attempt interacts with agent auth: prompts are blocked
 * up front when the agent is not ready, and an authRequired failure opens the
 * interactive challenge before the caller surfaces the gated message.
 */
export const makePromptAuthGate =
  (deps: PromptAuthGateDeps): PromptAuthGate =>
  async (input) => {
    if (deps.ensureReadyForPrompt !== undefined) {
      const ready = await deps.ensureReadyForPrompt(input.agentId)
      if (!ready.ok) {
        return { ok: false, error: { kind: "AUTH_GATED" } }
      }
    }

    const result = await deps.promptSession({
      agentId: input.agentId,
      sessionId: input.sessionId,
      text: input.text,
      ...(input.attachments !== undefined && input.attachments.length > 0
        ? { attachments: input.attachments }
        : {}),
    })
    if (!result.ok) {
      if (result.authRequired === true && deps.ensureSessionFromChallenge !== undefined) {
        await deps.ensureSessionFromChallenge(input.agentId)
        return { ok: false, error: { kind: "AUTH_GATED" } }
      }

      return { ok: false, error: { kind: "PROMPT_FAILED", reason: result.reason } }
    }

    return { ok: true }
  }
