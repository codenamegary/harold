import { describe, expect, test } from "bun:test"
import {
  createSessionCwdCache,
  createSessionHub,
  SessionStreamSink,
} from "./hub"
import { createCommandsCache } from "./commands.cache"
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

    const requestIds = { next: 0 }
    const hub = createSessionHub({
      cwdCache,
      createRequestId: () => `req-${++requestIds.next}`,
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

  test("prompt_complete and cancelled fan out to session subscribers", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

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

    await hub.prompt({
      subscriberId: "a",
      agentId: "cursor",
      sessionId: "s1",
      text: "hello",
    })
    expect(a.messages.some((m) => m.type === "prompt_complete")).toBe(true)
    expect(b.messages.some((m) => m.type === "prompt_complete")).toBe(true)

    await hub.cancel({
      subscriberId: "b",
      agentId: "cursor",
      sessionId: "s1",
    })
    expect(a.messages.some((m) => m.type === "cancelled")).toBe(true)
    expect(b.messages.some((m) => m.type === "cancelled")).toBe(true)
  })

  test("auth gate blocks prompt and fans auth_session_updated to agent subscribers", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })
    cwdCache.remember({ agentId: "cursor", sessionId: "s2", cwd: "/tmp/b" })

    let challenges = 0
    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      promptSession: async () => ({ ok: true }),
      cancelSession: async () => ({ ok: true }),
      authHooks: {
        ensureReadyForPrompt: async () => ({ ok: false }),
        ensureSessionFromChallenge: async () => {
          challenges += 1
        },
      },
    })

    const a = collectSink()
    const b = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s2" })

    await hub.prompt({
      subscriberId: "a",
      agentId: "cursor",
      sessionId: "s1",
      text: "hello",
    })

    expect(a.messages.some((m) => m.type === "prompt_complete")).toBe(false)
    expect(
      a.messages.some(
        (m) =>
          m.type === "error"
          && m.message.includes("Agent authentication required"),
      ),
    ).toBe(true)
    expect(challenges).toBe(0)

    hub.broadcastAuthSessionUpdated({
      agentId: "cursor",
      auth: {
        agentId: "cursor",
        status: "needs_auth",
        error: null,
        session: {
          sessionId: "auth-1",
          agentId: "cursor",
          status: "in_progress",
          steps: [],
          error: null,
        },
      },
    })

    expect(a.messages.some((m) => m.type === "auth_session_updated")).toBe(true)
    expect(b.messages.some((m) => m.type === "auth_session_updated")).toBe(true)
  })

  test("prompt authRequired opens challenge and errors without prompt_complete", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    let challenges = 0
    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      promptSession: async () => ({
        ok: false,
        reason: "Authentication required",
        authRequired: true,
      }),
      cancelSession: async () => ({ ok: true }),
      authHooks: {
        ensureReadyForPrompt: async () => ({ ok: true }),
        ensureSessionFromChallenge: async () => {
          challenges += 1
        },
      },
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    await hub.prompt({
      subscriberId: "a",
      agentId: "cursor",
      sessionId: "s1",
      text: "hello",
    })

    expect(challenges).toBe(1)
    expect(a.messages.some((m) => m.type === "prompt_complete")).toBe(false)
    expect(
      a.messages.some(
        (m) =>
          m.type === "error"
          && m.message.includes("Agent authentication required"),
      ),
    ).toBe(true)
  })

  test("caches commands with no subscriber and snapshots them to the joiner before subscribed", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/proj" })
    const commandsCache = createCommandsCache()
    const commandsUpdate = {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "web", description: "Search the web" }],
    }

    const hub = createSessionHub({
      cwdCache,
      commandsCache,
      loadSession: async () => ({ ok: true }),
      promptSession: async () => ({ ok: true }),
      cancelSession: async () => ({ ok: true }),
    })

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: commandsUpdate,
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    const updates = a.messages.filter((m) => m.type === "session_update")
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      type: "session_update",
      sessionId: "s1",
      update: commandsUpdate,
    })
    const subscribedIndex = a.messages.findIndex((m) => m.type === "subscribed")
    const snapshotIndex = a.messages.findIndex((m) => m === updates[0])
    expect(snapshotIndex).toBeGreaterThanOrEqual(0)
    expect(snapshotIndex).toBeLessThan(subscribedIndex)
  })

  test("live command updates replace the cache and fan out to every subscriber", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/proj" })
    const first = {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "web", description: "Search" }],
    }
    const second = {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "test", description: "Run tests" }],
    }

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

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: first,
    })
    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: second,
    })

    const commandUpdates = (messages: SessionStreamServerMessage[]) =>
      messages.filter(
        (m) =>
          m.type === "session_update" &&
          (m.update as { sessionUpdate?: string }).sessionUpdate ===
            "available_commands_update",
      )

    expect(commandUpdates(a.messages).map((m) => m.update)).toEqual([first, second])
    expect(commandUpdates(b.messages).map((m) => m.update)).toEqual([first, second])
  })

  test("command snapshot on subscribe goes only to the joining client", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/proj" })
    const commandsUpdate = {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "web", description: "Search the web" }],
    }

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

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: commandsUpdate,
    })

    const aBeforeB = a.messages.filter((m) => m.type === "session_update").length
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s1" })

    expect(a.messages.filter((m) => m.type === "session_update")).toHaveLength(aBeforeB)
    expect(
      b.messages.some(
        (m) =>
          m.type === "session_update" &&
          (m.update as { sessionUpdate?: string }).sessionUpdate ===
            "available_commands_update",
      ),
    ).toBe(true)
  })

  test("forgotten commands are not snapshotted on subscribe", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/proj" })
    const commandsCache = createCommandsCache()
    const commandsUpdate = {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "web", description: "Search the web" }],
    }

    const hub = createSessionHub({
      cwdCache,
      commandsCache,
      loadSession: async () => ({ ok: true }),
      promptSession: async () => ({ ok: true }),
      cancelSession: async () => ({ ok: true }),
    })

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: commandsUpdate,
    })
    commandsCache.forget({ agentId: "cursor", sessionId: "s1" })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    expect(a.messages.some((m) => m.type === "session_update")).toBe(false)
  })
})

describe("session hub config options", () => {
  const sampleConfig = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "m1",
      options: [{ value: "m1", name: "M1" }],
    },
  ]

  test("handleSessionConfig fans a session_config frame to every session subscriber", async () => {
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
    const c = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })
    hub.addSubscriber({ id: "c", sink: c.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "c", agentId: "cursor", sessionId: "s2" })

    hub.handleSessionConfig({
      agentId: "cursor",
      sessionId: "s1",
      configOptions: sampleConfig,
    })

    expect(a.messages.filter((m) => m.type === "session_config")).toEqual([
      {
        type: "session_config",
        agentId: "cursor",
        sessionId: "s1",
        configOptions: sampleConfig,
      },
    ])
    expect(b.messages.filter((m) => m.type === "session_config")).toHaveLength(1)
    expect(c.messages.filter((m) => m.type === "session_config")).toHaveLength(0)
  })

  test("config with no subscriber is cached and snapshotted to the joiner before subscribed", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      promptSession: async () => ({ ok: true }),
      cancelSession: async () => ({ ok: true }),
    })

    hub.handleSessionConfig({
      agentId: "cursor",
      sessionId: "s1",
      configOptions: sampleConfig,
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    const configIndex = a.messages.findIndex((m) => m.type === "session_config")
    const subscribedIndex = a.messages.findIndex((m) => m.type === "subscribed")
    expect(configIndex).toBeGreaterThanOrEqual(0)
    expect(configIndex).toBeLessThan(subscribedIndex)
    expect(a.messages[configIndex]).toMatchObject({
      type: "session_config",
      agentId: "cursor",
      sessionId: "s1",
      configOptions: sampleConfig,
    })
  })

  test("config arriving during load is routed to the loading subscriber only", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async ({ sessionId }) => {
        hub.handleSessionConfig({
          agentId: "cursor",
          sessionId,
          configOptions: sampleConfig,
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

    expect(a.messages.filter((m) => m.type === "session_config")).toHaveLength(1)
    expect(b.messages.filter((m) => m.type === "session_config")).toHaveLength(0)
  })
})
