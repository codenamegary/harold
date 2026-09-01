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

const noAttachmentsDeps = () => ({
  resolveAttachment: async () => null,
  advertisesPromptCapability: () => false,
})

describe("createAcpHubPromptSession", () => {
  test("awaits ACP session/prompt completion before returning ok", async () => {
    let resolveCompletion:
      | ((result: { ok: true; result: { stopReason: string } }) => void)
      | undefined

    const promptSession = createAcpHubPromptSession({
      ...noAttachmentsDeps(),
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
      ...noAttachmentsDeps(),
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
        ...noAttachmentsDeps(),
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

describe("createAcpHubPromptSession with attachments", () => {
  const baseStartPrompt = () => async () => ({
    ok: true as const,
    turnId: "turn-1",
    completion: Promise.resolve({ ok: true as const, result: { stopReason: "end_turn" } }),
  })

  const ref = {
    kind: "image" as const,
    name: "shot.png",
    mimeType: "image/png",
    path: "/tmp/ws/.agent-server/attachments/att_1.png",
  }

  test("maps an image attachment to an ACP image content block", async () => {
    const prompts: unknown[] = []
    const promptSession = createAcpHubPromptSession({
      startPrompt: async ({ prompt }) => {
        prompts.push(prompt)
        return baseStartPrompt()()
      },
      resolveAttachment: async ({ reference }) => reference,
      advertisesPromptCapability: () => true,
    })

    await expect(
      promptSession({ agentId: "a", sessionId: "s1", text: "look", attachments: [ref] }),
    ).resolves.toEqual({ ok: true })

    expect(prompts[0]).toEqual([
      { type: "text", text: "look" },
      { type: "image", url: `file://${ref.path}`, mimeType: "image/png" },
    ])
  })

  test("maps a file attachment to a resource_link content block", async () => {
    const prompts: unknown[] = []
    const promptSession = createAcpHubPromptSession({
      startPrompt: async ({ prompt }) => {
        prompts.push(prompt)
        return baseStartPrompt()()
      },
      resolveAttachment: async ({ reference }) => reference,
      advertisesPromptCapability: () => true,
    })

    await expect(
      promptSession({
        agentId: "a",
        sessionId: "s1",
        text: "read",
        attachments: [{ kind: "file", name: "notes.md", mimeType: "text/markdown", path: "/tmp/ws/.agent-server/attachments/att_2.md" }],
      }),
    ).resolves.toEqual({ ok: true })

    expect(prompts[0]).toEqual([
      { type: "text", text: "read" },
      {
        type: "resource_link",
        uri: "file:///tmp/ws/.agent-server/attachments/att_2.md",
        name: "notes.md",
        mimeType: "text/markdown",
      },
    ])
  })

  test("rejects an image when the agent lacks promptCapabilities.image", async () => {
    const startPrompt = baseStartPrompt()
    const promptSession = createAcpHubPromptSession({
      startPrompt,
      resolveAttachment: async ({ reference }) => reference,
      advertisesPromptCapability: ({ kind }) => kind !== "image",
    })

    await expect(
      promptSession({ agentId: "a", sessionId: "s1", text: "look", attachments: [ref] }),
    ).resolves.toEqual({
      ok: false,
      reason: "Agent does not advertise promptCapabilities.image — cannot attach shot.png",
    })
  })

  test("rejects a file when the agent lacks promptCapabilities.embeddedContext", async () => {
    const promptSession = createAcpHubPromptSession({
      startPrompt: baseStartPrompt(),
      resolveAttachment: async ({ reference }) => reference,
      advertisesPromptCapability: () => false,
    })

    await expect(
      promptSession({
        agentId: "a",
        sessionId: "s1",
        text: "read",
        attachments: [{ kind: "file", name: "notes.md", mimeType: "text/markdown", path: "/tmp/x.md" }],
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "Agent does not advertise promptCapabilities.embeddedContext — cannot attach notes.md",
    })
  })

  test("rejects a prompt when an attachment no longer resolves", async () => {
    let startPromptCalls = 0
    const promptSession = createAcpHubPromptSession({
      startPrompt: async () => {
        startPromptCalls += 1
        return baseStartPrompt()()
      },
      resolveAttachment: async () => null,
      advertisesPromptCapability: () => true,
    })

    await expect(
      promptSession({ agentId: "a", sessionId: "s1", text: "look", attachments: [ref] }),
    ).resolves.toEqual({
      ok: false,
      reason: "Attachment is no longer available: shot.png",
    })
    expect(startPromptCalls).toBe(0)
  })
})
