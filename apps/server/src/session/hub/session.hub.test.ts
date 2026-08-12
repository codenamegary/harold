import { describe, expect, test } from "bun:test"
import {
  createSessionCwdCache,
  createSessionHub,
  SessionStreamSink,
} from "./session.hub"
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

describe("session hub", () => {
  test("loads with cached cwd, fans out live updates to both subscribers, and routes load replay to one", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/proj" })

    const loads: Array<{ sessionId: string; cwd: string }> = []
    const hub = createSessionHub({
      cwdCache,
      loadSession: async ({ sessionId, cwd }) => {
        loads.push({ sessionId, cwd })
        hub.handleSessionUpdate({
          agentId: "cursor",
          sessionId,
          update: { sessionUpdate: "user_message_chunk", text: "replay" },
        })
        return { ok: true }
      },
      promptSession: async () => ({ ok: true }),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    const b = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })

    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    expect(loads).toEqual([{ sessionId: "s1", cwd: "/tmp/proj" }])
    expect(a.messages.filter((m) => m.type === "session_update")).toHaveLength(1)
    expect(b.messages.filter((m) => m.type === "session_update")).toHaveLength(0)

    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s1" })
    expect(loads).toHaveLength(2)
    expect(b.messages.some((m) => m.type === "session_update")).toBe(true)

    const liveBeforeA = a.messages.filter((m) => m.type === "session_update").length
    const liveBeforeB = b.messages.filter((m) => m.type === "session_update").length
    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "live" },
    })
    expect(a.messages.filter((m) => m.type === "session_update")).toHaveLength(liveBeforeA + 1)
    expect(b.messages.filter((m) => m.type === "session_update")).toHaveLength(liveBeforeB + 1)
  })

  test("switch leaves other subscribers on the previous session", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })
    cwdCache.remember({ agentId: "cursor", sessionId: "s2", cwd: "/tmp/b" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      promptSession: async () => ({ ok: true }),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    const b = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })

    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s1" })
    await hub.switchSession({ subscriberId: "a", agentId: "cursor", sessionId: "s2" })

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "still-on-s1" },
    })

    expect(
      b.messages.some(
        (m) =>
          m.type === "session_update" &&
          (m.update as { text?: string }).text === "still-on-s1",
      ),
    ).toBe(true)
    expect(
      a.messages.some(
        (m) =>
          m.type === "session_update" &&
          (m.update as { text?: string }).text === "still-on-s1",
      ),
    ).toBe(false)
  })

  test("permission first reply wins", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    let requestIds = 0
    const hub = createSessionHub({
      cwdCache,
      createRequestId: () => `req-${++requestIds}`,
      loadSession: async () => ({ ok: true }),
      promptSession: async () => ({ ok: true }),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    const b = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s1" })

    const pending = hub.requestPermission({
      agentId: "cursor",
      sessionId: "s1",
      params: { toolCall: { toolCallId: "t1", name: "edit" } },
    })

    expect(a.messages.some((m) => m.type === "permission_request")).toBe(true)
    expect(b.messages.some((m) => m.type === "permission_request")).toBe(true)

    hub.resolvePermissionReply({ requestId: "req-1", optionId: "allow-once" })
    hub.resolvePermissionReply({ requestId: "req-1", optionId: "reject-once" })

    await expect(pending).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "allow-once" },
    })
  })
})
