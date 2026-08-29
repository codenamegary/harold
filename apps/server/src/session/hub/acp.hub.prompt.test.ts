import { describe, expect, test } from "bun:test"
import { createAcpHubPromptSession } from "./acp.hub.prompt"
import {
  createSessionCwdCache,
  createSessionHub,
  SessionStreamSink,
} from "./hub"
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

describe("createAcpHubPromptSession", () => {
  test("awaits ACP session/prompt completion before returning ok", async () => {
    let resolveCompletion:
      | ((result: { ok: true; result: { stopReason: string } }) => void)
      | undefined

    const promptSession = createAcpHubPromptSession({
      startPrompt: async () => ({
        ok: true as const,
        turnId: "turn-1",
        completion: new Promise((resolve) => {
          resolveCompletion = resolve
        }),
      }),
    })

    let settled = false
    const pending = promptSession({
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
    await expect(pending).resolves.toEqual({ ok: true })
    expect(settled).toBe(true)
  })

  test("returns ACP prompt failure reasons to the hub", async () => {
    const promptSession = createAcpHubPromptSession({
      startPrompt: async () => ({
        ok: true as const,
        turnId: "turn-1",
        completion: Promise.resolve({
          ok: false as const,
          reason: "session/prompt failed: boom",
        }),
      }),
    })

    await expect(
      promptSession({
        agentId: "cursor",
        sessionId: "s1",
        text: "hello",
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "session/prompt failed: boom",
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
      promptSession: createAcpHubPromptSession({
        startPrompt: async () => ({
          ok: true as const,
          turnId: "turn-1",
          completion: new Promise((resolve) => {
            resolveCompletion = resolve
          }),
        }),
      }),
      cancelSession: async () => ({ ok: true }),
    })

    const sink = collectSink()
    hub.addSubscriber({ id: "web", sink: sink.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "web",
      agentId: "opencode",
      sessionId: "s1",
    })

    const promptDone = hub.prompt({
      subscriberId: "web",
      agentId: "opencode",
      sessionId: "s1",
      text: "hello",
    })

    await Promise.resolve()
    expect(sink.messages.some((message) => message.type === "prompt_complete")).toBe(
      false,
    )

    resolveCompletion?.({ ok: true, result: { stopReason: "end_turn" } })
    await promptDone

    expect(sink.messages.some((message) => message.type === "prompt_complete")).toBe(
      true,
    )
  })

  test("hub emits error when ACP prompt completion fails", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      promptSession: createAcpHubPromptSession({
        startPrompt: async () => ({
          ok: true as const,
          turnId: "turn-1",
          completion: Promise.resolve({
            ok: false as const,
            reason: "session/prompt failed: boom",
          }),
        }),
      }),
      cancelSession: async () => ({ ok: true }),
    })

    const sink = collectSink()
    hub.addSubscriber({ id: "web", sink: sink.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "web",
      agentId: "cursor",
      sessionId: "s1",
    })

    await hub.prompt({
      subscriberId: "web",
      agentId: "cursor",
      sessionId: "s1",
      text: "hello",
    })

    expect(sink.messages.some((message) => message.type === "prompt_complete")).toBe(
      false,
    )
    expect(
      sink.messages.some(
        (message) =>
          message.type === "error" &&
          message.message === "session/prompt failed: boom",
      ),
    ).toBe(true)
  })
})
