import { describe, expect, test } from "bun:test"
import {
  createSessionCwdCache,
  createSessionHub,
  ElicitationLogEvent,
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
    sink: { send: (message) => messages.push(message) },
  }
}

const createHarness = (options?: {
  elicitationTimeoutMs?: number
  logElicitation?: (event: ElicitationLogEvent) => void
}) => {
  const cwdCache = createSessionCwdCache()
  cwdCache.remember({ agentId: "opencode", sessionId: "s1", cwd: "/tmp/a" })
  cwdCache.remember({ agentId: "opencode", sessionId: "s2", cwd: "/tmp/b" })

  let nextRequest = 0
  const hub = createSessionHub({
    cwdCache,
    createRequestId: () => `req-${++nextRequest}`,
    loadSession: async () => ({ ok: true }),
    runPromptTurn: async () => ({ ok: true }),
    acceptPrompt: async () => ({ ok: true }),
    completePromptTurn: async ({ outcome }) => outcome,
    cancelSession: async () => ({ ok: true }),
    elicitationTimeoutMs: options?.elicitationTimeoutMs ?? 60_000,
    ...(options?.logElicitation === undefined ? {} : { logElicitation: options.logElicitation }),
  })

  const attach = async (id: string, sessionId = "s1") => {
    const sink = collectSink()
    hub.addSubscriber({ id, sink: sink.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: id, agentId: "opencode", sessionId })
    return sink.messages
  }

  return { hub, cwdCache, attach }
}

const elicitationParams = (overrides: Record<string, unknown> = {}) => ({
  mode: "form",
  sessionId: "s1",
  message: "Questions",
  requestedSchema: {
    type: "object",
    properties: {
      q0: { type: "string", title: "Package Manager" },
    },
  },
  ...overrides,
})

describe("session hub elicitation", () => {
  test("fans out an elicitation request with expiresAt and resolves with the app result", async () => {
    const { hub, attach } = createHarness()
    const a = await attach("a")
    const b = await attach("b")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: 7,
    })

    const request = a.find((message) => message.type === "elicitation_request")
    expect(request).toMatchObject({
      type: "elicitation_request",
      requestId: "req-1",
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
    })
    expect(b.some((message) => message.type === "elicitation_request")).toBe(true)
    expect(request?.type === "elicitation_request" && request.expiresAt).toBeString()

    expect(
      hub.resolveElicitationReply({
        requestId: "req-1",
        result: { action: "accept", content: { q0: "bun" } },
      }),
    ).toBe("settled")

    expect(await pending).toEqual({
      action: "accept",
      content: { q0: "bun" },
    })
    expect(b).toContainEqual({
      type: "elicitation_resolved",
      requestId: "req-1",
      agentId: "opencode",
      sessionId: "s1",
      reason: "replied",
      result: { action: "accept", content: { q0: "bun" } },
    })
  })

  test("first reply wins and later or unknown replies are rejected", async () => {
    const { hub, attach } = createHarness()
    await attach("a")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: 7,
    })

    expect(hub.resolveElicitationReply({ requestId: "req-1", result: { action: "decline" } })).toBe(
      "settled",
    )
    expect(hub.resolveElicitationReply({ requestId: "req-1", result: { action: "cancel" } })).toBe(
      "already_settled",
    )
    expect(hub.resolveElicitationReply({ requestId: "req-missing", result: {} })).toBe("unknown")
    expect(await pending).toEqual({ action: "decline" })
  })

  test("times out with cancel after the configured window", async () => {
    const { hub, attach } = createHarness({ elicitationTimeoutMs: 20 })
    const a = await attach("a")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: 7,
    })

    expect(await pending).toEqual({ action: "cancel" })
    expect(a).toContainEqual({
      type: "elicitation_resolved",
      requestId: "req-1",
      agentId: "opencode",
      sessionId: "s1",
      reason: "timed_out",
      result: { action: "cancel" },
    })
    expect(hub.resolveElicitationReply({ requestId: "req-1", result: {} })).toBe("already_settled")
  })

  test("session cancel settles pending elicitations as session_cancelled", async () => {
    const { hub, attach } = createHarness()
    const a = await attach("a")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: 7,
    })

    expect(await hub.cancel({ agentId: "opencode", sessionId: "s1" })).toEqual({ ok: true })

    expect(await pending).toEqual({ action: "cancel" })
    expect(a).toContainEqual({
      type: "elicitation_resolved",
      requestId: "req-1",
      agentId: "opencode",
      sessionId: "s1",
      reason: "session_cancelled",
      result: { action: "cancel" },
    })
  })

  test("session close settles pending elicitations as session_cancelled", async () => {
    const { hub, attach } = createHarness()
    const a = await attach("a")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: 7,
    })

    hub.closeSession({ agentId: "opencode", sessionId: "s1" })

    expect(await pending).toEqual({ action: "cancel" })
    expect(a).toContainEqual(
      expect.objectContaining({
        type: "elicitation_resolved",
        reason: "session_cancelled",
      }),
    )
  })

  test("agent exit settles only that agent's pending elicitations", async () => {
    const { hub, attach } = createHarness()
    const a = await attach("a")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: 7,
    })
    const other = hub.requestElicitation({
      agentId: "cursor",
      sessionId: "s2",
      params: elicitationParams(),
      jsonRpcId: 8,
    })

    hub.agentExited({ agentId: "opencode" })

    expect(await pending).toEqual({ action: "cancel" })
    expect(hub.resolveElicitationReply({ requestId: "req-2", result: {} })).toBe("settled")
    expect(await other).toEqual({})
    expect(a).toContainEqual(
      expect.objectContaining({
        type: "elicitation_resolved",
        requestId: "req-1",
        reason: "agent_exited",
      }),
    )
  })

  test("agent request cancellation resolves the matching elicitation", async () => {
    const { hub, attach } = createHarness()
    const a = await attach("a")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: "agent-request-9",
    })

    hub.cancelElicitationByAgent({ agentId: "opencode", jsonRpcId: "agent-request-9" })

    expect(await pending).toEqual({ action: "cancel" })
    expect(a).toContainEqual({
      type: "elicitation_resolved",
      requestId: "req-1",
      agentId: "opencode",
      sessionId: "s1",
      reason: "cancelled_by_agent",
      result: { action: "cancel" },
    })
  })

  test("re-emits pending and recently resolved elicitations on subscribe", async () => {
    const { hub, attach } = createHarness()
    await attach("a")

    const resolved = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: 7,
    })
    hub.resolveElicitationReply({ requestId: "req-1", result: { action: "decline" } })
    await resolved

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams({ message: "Second" }),
      jsonRpcId: 8,
    })

    const b = await attach("b")
    expect(b).toContainEqual(
      expect.objectContaining({
        type: "elicitation_request",
        requestId: "req-2",
        params: elicitationParams({ message: "Second" }),
      }),
    )
    expect(b).toContainEqual(
      expect.objectContaining({
        type: "elicitation_resolved",
        requestId: "req-1",
        reason: "replied",
      }),
    )

    hub.closeSession({ agentId: "opencode", sessionId: "s1" })
    await pending
  })

  test("emits elicitation_completed for a known URL elicitation id only", async () => {
    const { hub, attach } = createHarness()
    const a = await attach("a")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: {
        mode: "url",
        elicitationId: "url-1",
        sessionId: "s1",
        url: "https://example.com/connect",
        message: "Authorize",
      },
      jsonRpcId: 7,
    })
    hub.resolveElicitationReply({
      requestId: "req-1",
      result: { action: "accept" },
    })
    await pending

    hub.completeElicitation({ agentId: "opencode", elicitationId: "url-unknown" })
    hub.completeElicitation({ agentId: "opencode", elicitationId: "url-1" })

    const completed = a.filter((message) => message.type === "elicitation_completed")
    expect(completed).toEqual([
      {
        type: "elicitation_completed",
        elicitationId: "url-1",
        requestId: "req-1",
        agentId: "opencode",
        sessionId: "s1",
      },
    ])
  })

  test("logs metadata only", async () => {
    const logs: ElicitationLogEvent[] = []
    const { hub, attach } = createHarness({
      logElicitation: (event) => logs.push(event),
    })
    await attach("a")

    const pending = hub.requestElicitation({
      agentId: "opencode",
      sessionId: "s1",
      params: elicitationParams(),
      jsonRpcId: 7,
    })
    hub.resolveElicitationReply({
      requestId: "req-1",
      result: { action: "accept", content: { q0: "bun" } },
    })
    await pending

    expect(logs).toEqual([
      {
        requestId: "req-1",
        agentId: "opencode",
        sessionId: "s1",
        mode: "form",
        fieldCount: 1,
        outcome: "replied",
        durationMs: expect.any(Number),
      },
    ])
    expect(JSON.stringify(logs)).not.toContain("bun")
  })

  test("caps recently resolved elicitations at 64 per session", async () => {
    const { hub, attach } = createHarness()
    await attach("a")

    for (let index = 0; index < 70; index += 1) {
      const pending = hub.requestElicitation({
        agentId: "opencode",
        sessionId: "s1",
        params: elicitationParams(),
        jsonRpcId: index,
      })
      hub.resolveElicitationReply({
        requestId: `req-${index + 1}`,
        result: { action: "decline" },
      })
      await pending
    }

    const b = await attach("b")
    expect(b.filter((message) => message.type === "elicitation_resolved")).toHaveLength(64)
  })
})
