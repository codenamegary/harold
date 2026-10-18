import { describe, expect, test } from "bun:test"
import { AUTH_GATED_PROMPT_MESSAGE } from "../acp/auth.required"
import { makeAcceptPrompt, makeCompletePromptTurn } from "./session.prompt.gate.usecase"

const attachmentRef = {
  kind: "image" as const,
  name: "shot.png",
  mimeType: "image/png",
  path: "/tmp/ws/.harold/attachments/att_1.png",
}

describe("makeAcceptPrompt", () => {
  test("refuses an attachment the agent lacks a prompt capability for", async () => {
    const acceptPrompt = makeAcceptPrompt({
      advertisesPromptCapability: ({ kind }) => kind !== "image",
      ensureSessionBound: async () => ({ ok: true }),
    })

    expect(
      await acceptPrompt({
        agentId: "cursor",
        sessionId: "s1",
        cwd: "/tmp/ws",
        attachments: [attachmentRef],
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "rejected",
        reason: "Agent does not advertise promptCapabilities.image — cannot attach shot.png",
      },
    })
  })

  test("refuses without binding when the agent is not ready for prompts", async () => {
    let bound = 0
    const acceptPrompt = makeAcceptPrompt({
      advertisesPromptCapability: () => true,
      ensureReadyForPrompt: async () => ({ ok: false }),
      ensureSessionBound: async () => {
        bound += 1
        return { ok: true }
      },
    })

    expect(await acceptPrompt({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" })).toEqual({
      ok: false,
      error: { kind: "auth_gated", reason: AUTH_GATED_PROMPT_MESSAGE },
    })
    expect(bound).toBe(0)
  })

  test("binds the session before accepting and maps bind failures to rejections", async () => {
    const boundWith: Array<{ agentId: string; sessionId: string; cwd: string }> = []
    const acceptPrompt = makeAcceptPrompt({
      advertisesPromptCapability: () => true,
      ensureSessionBound: async (params) => {
        boundWith.push(params)
        return { ok: false, reason: "ACP supervisor is not ready" }
      },
    })

    expect(await acceptPrompt({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" })).toEqual({
      ok: false,
      error: { kind: "rejected", reason: "ACP supervisor is not ready" },
    })
    expect(boundWith).toEqual([{ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" }])
  })

  test("maps auth-required bind failures to auth_gated", async () => {
    const acceptPrompt = makeAcceptPrompt({
      advertisesPromptCapability: () => true,
      ensureSessionBound: async () => ({
        ok: false,
        reason: "session/load failed: Authentication required",
        authRequired: true,
      }),
    })

    expect(await acceptPrompt({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" })).toEqual({
      ok: false,
      error: { kind: "auth_gated", reason: AUTH_GATED_PROMPT_MESSAGE },
    })
  })

  test("accepts after the session is bound", async () => {
    let bound = 0
    const acceptPrompt = makeAcceptPrompt({
      advertisesPromptCapability: () => true,
      ensureReadyForPrompt: async () => ({ ok: true }),
      ensureSessionBound: async () => {
        bound += 1
        return { ok: true }
      },
    })

    expect(await acceptPrompt({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" })).toEqual({
      ok: true,
    })
    expect(bound).toBe(1)
  })
})

describe("makeCompletePromptTurn", () => {
  test("passes successful and non-auth failures through untouched", async () => {
    const completePromptTurn = makeCompletePromptTurn({})

    expect(await completePromptTurn({ agentId: "cursor", outcome: { ok: true } })).toEqual({
      ok: true,
    })
    expect(
      await completePromptTurn({
        agentId: "cursor",
        outcome: { ok: false, reason: "session/prompt failed: boom" },
      }),
    ).toEqual({ ok: false, reason: "session/prompt failed: boom" })
  })

  test("runs the challenge and returns the gated outcome for auth-required turns", async () => {
    let challenges = 0
    const completePromptTurn = makeCompletePromptTurn({
      ensureSessionFromChallenge: async () => {
        challenges += 1
      },
    })

    expect(
      await completePromptTurn({
        agentId: "cursor",
        outcome: { ok: false, reason: "Authentication required", authRequired: true },
      }),
    ).toEqual({ ok: false, reason: AUTH_GATED_PROMPT_MESSAGE, authRequired: true })
    expect(challenges).toBe(1)
  })

  test("shares one challenge across concurrent auth-gated turns", async () => {
    let challenges = 0
    let releaseChallenge: (() => void) | undefined
    const completePromptTurn = makeCompletePromptTurn({
      ensureSessionFromChallenge: async () => {
        challenges += 1
        await new Promise<void>((resolve) => {
          releaseChallenge = resolve
        })
      },
    })

    const first = completePromptTurn({
      agentId: "cursor",
      outcome: { ok: false, reason: "Authentication required", authRequired: true },
    })
    const second = completePromptTurn({
      agentId: "cursor",
      outcome: { ok: false, reason: "Authentication required", authRequired: true },
    })

    await Promise.resolve()
    expect(challenges).toBe(1)
    releaseChallenge?.()

    expect(await first).toEqual({
      ok: false,
      reason: AUTH_GATED_PROMPT_MESSAGE,
      authRequired: true,
    })
    expect(await second).toEqual({
      ok: false,
      reason: AUTH_GATED_PROMPT_MESSAGE,
      authRequired: true,
    })
    expect(challenges).toBe(1)
  })

  test("returns the gated outcome even when no challenge handler is wired", async () => {
    const completePromptTurn = makeCompletePromptTurn({})

    expect(
      await completePromptTurn({
        agentId: "cursor",
        outcome: { ok: false, reason: "Authentication required", authRequired: true },
      }),
    ).toEqual({ ok: false, reason: AUTH_GATED_PROMPT_MESSAGE, authRequired: true })
  })
})
