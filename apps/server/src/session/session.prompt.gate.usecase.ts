import { AgentId } from "contracts/http/agent-settings"
import { AttachmentKind, AttachmentReference } from "contracts/http/attachments"
import { AUTH_GATED_PROMPT_MESSAGE } from "../acp/auth.required"
import { attachmentCapabilityFor } from "./hub/acp.hub.prompt"
import {
  EnsureReadyForPrompt,
  EnsureSessionBound,
  EnsureSessionFromChallenge,
  SessionCommandError,
  SessionPromptOutcome,
} from "./session.ports"

export type PromptAcceptDeps = Readonly<{
  /**
   * Capability gate. `image` maps to promptCapabilities.image,
   * `file` to promptCapabilities.embeddedContext.
   */
  advertisesPromptCapability: (params: { agentId: AgentId; kind: AttachmentKind }) => boolean
  ensureReadyForPrompt?: EnsureReadyForPrompt
  ensureSessionBound: EnsureSessionBound
}>

export type PromptAcceptInput = Readonly<{
  agentId: AgentId
  sessionId: string
  cwd: string
  attachments?: ReadonlyArray<AttachmentReference>
}>

/**
 * Endpoint-side preflight: capability check, auth readiness, and the bind
 * upsert. Refusals map straight onto HTTP statuses; acceptance means the turn
 * may be queued.
 */
export type PromptAccept = (
  input: PromptAcceptInput,
) => Promise<{ ok: true } | { ok: false; error: SessionCommandError }>

export const makeAcceptPrompt =
  (deps: PromptAcceptDeps): PromptAccept =>
  async (input) => {
    for (const reference of input.attachments ?? []) {
      if (!deps.advertisesPromptCapability({ agentId: input.agentId, kind: reference.kind })) {
        return {
          ok: false,
          error: {
            kind: "rejected",
            reason: `Agent does not advertise ${attachmentCapabilityFor(reference.kind)} — cannot attach ${reference.name}`,
          },
        }
      }
    }

    if (deps.ensureReadyForPrompt !== undefined) {
      const ready = await deps.ensureReadyForPrompt(input.agentId)
      if (!ready.ok) {
        return { ok: false, error: { kind: "auth_gated", reason: AUTH_GATED_PROMPT_MESSAGE } }
      }
    }

    const bound = await deps.ensureSessionBound({
      agentId: input.agentId,
      sessionId: input.sessionId,
      cwd: input.cwd,
    })
    if (!bound.ok) {
      return {
        ok: false,
        error:
          bound.authRequired === true
            ? { kind: "auth_gated", reason: AUTH_GATED_PROMPT_MESSAGE }
            : { kind: "rejected", reason: bound.reason },
      }
    }

    return { ok: true }
  }

export type PromptCompleteTurnDeps = Readonly<{
  ensureSessionFromChallenge?: EnsureSessionFromChallenge
}>

/**
 * Post-turn auth handling: an auth-required outcome runs the interactive
 * challenge — once per agent, shared across concurrent turns — and resolves as
 * the gated outcome.
 */
export type PromptCompleteTurn = (params: {
  agentId: AgentId
  outcome: SessionPromptOutcome
}) => Promise<SessionPromptOutcome>

export const makeCompletePromptTurn = (deps: PromptCompleteTurnDeps): PromptCompleteTurn => {
  const challengeByAgent = new Map<AgentId, Promise<void>>()

  const runChallengeOnce = async (agentId: AgentId): Promise<void> => {
    const challenge = deps.ensureSessionFromChallenge
    if (challenge === undefined) {
      return
    }

    const inFlight = challengeByAgent.get(agentId)
    if (inFlight !== undefined) {
      await inFlight
      return
    }

    const run = (async () => {
      try {
        await challenge(agentId)
      } finally {
        challengeByAgent.delete(agentId)
      }
    })()
    challengeByAgent.set(agentId, run)
    await run
  }

  return async ({ agentId, outcome }) => {
    if (outcome.ok || outcome.authRequired !== true) {
      return outcome
    }

    await runChallengeOnce(agentId)
    return { ok: false, reason: AUTH_GATED_PROMPT_MESSAGE, authRequired: true }
  }
}
