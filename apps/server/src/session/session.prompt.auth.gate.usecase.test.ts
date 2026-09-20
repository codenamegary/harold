import { describe, expect, test } from "bun:test"
import { AgentIdSchema } from "contracts/http/agent-settings"
import { AttachmentReference } from "contracts/http/attachments"
import { makePromptAuthGate } from "./session.prompt.auth.gate.usecase"

const agentId = AgentIdSchema.parse("cursor")

const attachment: AttachmentReference = {
  kind: "file",
  name: "notes.md",
  mimeType: "text/markdown",
  path: "/tmp/ws/.agent-server/attachments/att_1.md",
}

const okPrompt = () => async () => ({ ok: true as const })

describe("makePromptAuthGate", () => {
  test("runs the prompt and returns ok when auth is ready", async () => {
    const prompts: Array<{ text: string }> = []
    const promptAuthGate = makePromptAuthGate({
      promptSession: async (input) => {
        prompts.push({ text: input.text })
        return { ok: true }
      },
      ensureReadyForPrompt: async () => ({ ok: true }),
    })

    const result = await promptAuthGate({ agentId, sessionId: "s1", text: "hello" })

    expect(result).toEqual({ ok: true })
    expect(prompts).toEqual([{ text: "hello" }])
  })

  test("returns AUTH_GATED without prompting when the ready check fails", async () => {
    let prompted = false
    let challenged = false
    const promptAuthGate = makePromptAuthGate({
      promptSession: async () => {
        prompted = true
        return { ok: true }
      },
      ensureReadyForPrompt: async () => ({ ok: false }),
      ensureSessionFromChallenge: async () => {
        challenged = true
      },
    })

    const result = await promptAuthGate({ agentId, sessionId: "s1", text: "hello" })

    expect(result).toEqual({ ok: false, error: { kind: "AUTH_GATED" } })
    expect(prompted).toBe(false)
    expect(challenged).toBe(false)
  })

  test("runs the challenge and returns AUTH_GATED when the prompt reports authRequired", async () => {
    let challenges = 0
    const promptAuthGate = makePromptAuthGate({
      promptSession: async () => ({
        ok: false,
        reason: "Authentication required",
        authRequired: true,
      }),
      ensureReadyForPrompt: async () => ({ ok: true }),
      ensureSessionFromChallenge: async () => {
        challenges += 1
      },
    })

    const result = await promptAuthGate({ agentId, sessionId: "s1", text: "hello" })

    expect(result).toEqual({ ok: false, error: { kind: "AUTH_GATED" } })
    expect(challenges).toBe(1)
  })

  test("returns PROMPT_FAILED with the reason when the prompt fails without authRequired", async () => {
    let challenges = 0
    const promptAuthGate = makePromptAuthGate({
      promptSession: async () => ({ ok: false, reason: "session/prompt failed: boom" }),
      ensureReadyForPrompt: async () => ({ ok: true }),
      ensureSessionFromChallenge: async () => {
        challenges += 1
      },
    })

    const result = await promptAuthGate({ agentId, sessionId: "s1", text: "hello" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "PROMPT_FAILED", reason: "session/prompt failed: boom" },
    })
    expect(challenges).toBe(0)
  })

  test("returns PROMPT_FAILED when authRequired fires with no challenge hook", async () => {
    const promptAuthGate = makePromptAuthGate({
      promptSession: async () => ({
        ok: false,
        reason: "Authentication required",
        authRequired: true,
      }),
      ensureReadyForPrompt: async () => ({ ok: true }),
    })

    const result = await promptAuthGate({ agentId, sessionId: "s1", text: "hello" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "PROMPT_FAILED", reason: "Authentication required" },
    })
  })

  test("prompts without auth hooks when none are provided", async () => {
    const promptAuthGate = makePromptAuthGate({ promptSession: okPrompt() })

    const result = await promptAuthGate({ agentId, sessionId: "s1", text: "hello" })

    expect(result).toEqual({ ok: true })
  })

  test("forwards non-empty attachments and drops empty ones", async () => {
    const seen: Array<ReadonlyArray<AttachmentReference> | undefined> = []
    const promptAuthGate = makePromptAuthGate({
      promptSession: async (input) => {
        seen.push(input.attachments)
        return { ok: true }
      },
    })

    await promptAuthGate({
      agentId,
      sessionId: "s1",
      text: "look",
      attachments: [attachment],
    })
    await promptAuthGate({ agentId, sessionId: "s1", text: "plain", attachments: [] })
    await promptAuthGate({ agentId, sessionId: "s1", text: "bare" })

    expect(seen).toEqual([[attachment], undefined, undefined])
  })
})
