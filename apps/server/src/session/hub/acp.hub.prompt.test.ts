import { describe, expect, test } from "bun:test"
import { createAcpPromptTurn } from "./acp.hub.prompt"
import { createSessionCwdCache, createSessionHub, SessionStreamSink } from "./hub"
import { SessionStreamServerMessage } from "contracts/http/session.stream"

const collectSink = (): {
  sink: SessionStreamSink
  messages: SessionStreamServerMessage[]
} => {
  const messages: SessionStreamServerMessage[] = []
  return {
    messages,
    sink: {
      send: (message) => {
        messages.push(message)
      },
    },
  }
}

const okPromptDeps = () => ({
  acceptPrompt: async () => ({ ok: true as const }),
  completePromptTurn: async ({
    outcome,
  }: {
    outcome: { ok: true } | { ok: false; reason: string }
  }) => outcome,
})

const completedStartPrompt = () => async () => ({
  ok: true as const,
  turnId: "turn-1",
  completion: Promise.resolve({ ok: true as const, result: { stopReason: "end_turn" } }),
})

describe("createAcpPromptTurn", () => {
  test("awaits the ACP completion and resolves the mapped outcome", async () => {
    let resolveCompletion:
      | ((result: { ok: true; result: { stopReason: string } }) => void)
      | undefined

    const turn = createAcpPromptTurn({
      resolveAttachment: async () => null,
      startPrompt: async () => ({
        ok: true as const,
        turnId: "turn-1",
        completion: new Promise((resolve) => {
          resolveCompletion = resolve
        }),
      }),
    })

    let settled = false
    const outcome = turn({
      agentId: "opencode",
      sessionId: "s1",
      text: "hello",
    }).then((result) => {
      settled = true
      return result
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    resolveCompletion?.({ ok: true, result: { stopReason: "end_turn" } })
    expect(await outcome).toEqual({ ok: true })
  })

  test("resolves the outcome with ACP prompt failure reasons", async () => {
    const turn = createAcpPromptTurn({
      resolveAttachment: async () => null,
      startPrompt: async () => ({
        ok: true as const,
        turnId: "turn-1",
        completion: Promise.resolve({
          ok: false as const,
          reason: "session/prompt failed: boom",
        }),
      }),
    })

    expect(await turn({ agentId: "cursor", sessionId: "s1", text: "hello" })).toEqual({
      ok: false,
      reason: "session/prompt failed: boom",
    })
  })

  test("resolves the outcome with prompt-start failures", async () => {
    const turn = createAcpPromptTurn({
      resolveAttachment: async () => null,
      startPrompt: async () => ({
        ok: false as const,
        reason: "not bound",
      }),
    })

    expect(await turn({ agentId: "cursor", sessionId: "s1", text: "hello" })).toEqual({
      ok: false,
      reason: "not bound",
    })
  })

  test("hub emits prompt_complete only after ACP completion settles", async () => {
    let resolveCompletion:
      | ((result: { ok: true; result: { stopReason: string } }) => void)
      | undefined

    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "opencode", sessionId: "s1", cwd: "/tmp/ws" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      runPromptTurn: createAcpPromptTurn({
        resolveAttachment: async () => null,
        startPrompt: async () => ({
          ok: true as const,
          turnId: "turn-1",
          completion: new Promise((resolve) => {
            resolveCompletion = resolve
          }),
        }),
      }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const sink = collectSink()
    hub.addSubscriber({ id: "web", sink: sink.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "web",
      agentId: "opencode",
      sessionId: "s1",
    })

    const result = await hub.prompt({
      agentId: "opencode",
      sessionId: "s1",
      text: "hello",
    })
    expect(result).toEqual({ ok: true })

    await Promise.resolve()
    expect(sink.messages.some((message) => message.type === "prompt_complete")).toBe(false)

    resolveCompletion?.({ ok: true, result: { stopReason: "end_turn" } })
    await hub.awaitPromptTurns()

    expect(sink.messages.some((message) => message.type === "prompt_complete")).toBe(true)
  })

  test("hub emits error to session subscribers when ACP prompt completion fails", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      runPromptTurn: createAcpPromptTurn({
        resolveAttachment: async () => null,
        startPrompt: async () => ({
          ok: true as const,
          turnId: "turn-1",
          completion: Promise.resolve({
            ok: false as const,
            reason: "session/prompt failed: boom",
          }),
        }),
      }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const sink = collectSink()
    hub.addSubscriber({ id: "web", sink: sink.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "web",
      agentId: "cursor",
      sessionId: "s1",
    })

    const result = await hub.prompt({
      agentId: "cursor",
      sessionId: "s1",
      text: "hello",
    })
    expect(result).toEqual({ ok: true })
    await hub.awaitPromptTurns()

    expect(sink.messages.some((message) => message.type === "prompt_complete")).toBe(false)
    expect(
      sink.messages.some(
        (message) => message.type === "error" && message.message === "session/prompt failed: boom",
      ),
    ).toBe(true)
  })
})

describe("createAcpPromptTurn with attachments", () => {
  const ref = {
    kind: "image" as const,
    name: "shot.png",
    mimeType: "image/png",
    path: "/tmp/ws/.harold/attachments/att_1.png",
  }

  test("maps an image attachment to an ACP image content block with base64 data", async () => {
    const prompts: unknown[] = []
    const bytes = new Uint8Array([137, 80, 78, 71])
    const turn = createAcpPromptTurn({
      startPrompt: async ({ prompt }) => {
        prompts.push(prompt)
        return completedStartPrompt()()
      },
      resolveAttachment: async ({ reference }) => ({ reference, bytes }),
    })

    expect(
      turn({ agentId: "a", sessionId: "s1", text: "look", attachments: [ref] }),
    ).resolves.toMatchObject({ ok: true })

    expect(prompts[0]).toEqual([
      { type: "text", text: "look" },
      {
        type: "image",
        data: Buffer.from(bytes).toString("base64"),
        mimeType: "image/png",
      },
    ])
  })

  test("maps a file attachment to a resource_link content block", async () => {
    const prompts: unknown[] = []
    const turn = createAcpPromptTurn({
      startPrompt: async ({ prompt }) => {
        prompts.push(prompt)
        return completedStartPrompt()()
      },
      resolveAttachment: async ({ reference }) => ({
        reference,
        bytes: new Uint8Array([1]),
      }),
    })

    expect(
      turn({
        agentId: "a",
        sessionId: "s1",
        text: "read",
        attachments: [
          {
            kind: "file",
            name: "notes.md",
            mimeType: "text/markdown",
            path: "/tmp/ws/.harold/attachments/att_2.md",
          },
        ],
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(prompts[0]).toEqual([
      { type: "text", text: "read" },
      {
        type: "resource_link",
        uri: "file:///tmp/ws/.harold/attachments/att_2.md",
        name: "notes.md",
      },
    ])
  })

  test("rejects a prompt when an attachment no longer resolves", async () => {
    let startPromptCalls = 0
    const turn = createAcpPromptTurn({
      startPrompt: async () => {
        startPromptCalls += 1
        return completedStartPrompt()()
      },
      resolveAttachment: async () => null,
    })

    expect(
      turn({ agentId: "a", sessionId: "s1", text: "look", attachments: [ref] }),
    ).resolves.toEqual({
      ok: false,
      reason: "Attachment is no longer available: shot.png",
    })
    expect(startPromptCalls).toBe(0)
  })
})
