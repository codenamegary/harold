import { describe, expect, test } from "bun:test"
import { createSessionCwdCache, createSessionHub, SessionStreamSink } from "./hub"
import { AUTH_GATED_PROMPT_MESSAGE } from "../../acp/auth.required"
import {
  makeCompletePromptTurn,
  PromptAccept,
  PromptCompleteTurn,
} from "../session.prompt.gate.usecase"
import { createCommandsCache } from "./commands.cache"
import { createSessionEventLog } from "./event.log"
import { SessionStreamServerMessage } from "contracts/http/session.stream"

type SentFrame = {
  message: SessionStreamServerMessage
  cursor?: string
}

const collectSink = (): {
  sink: SessionStreamSink
  messages: SessionStreamServerMessage[]
  frames: SentFrame[]
} => {
  const messages: SessionStreamServerMessage[] = []
  const frames: SentFrame[] = []
  return {
    messages,
    frames,
    sink: {
      send: (message, options) => {
        messages.push(message)
        frames.push({
          message,
          ...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
        })
      },
    },
  }
}

const subscribedCursor = (frames: ReadonlyArray<SentFrame>): string => {
  const subscribed = frames.findLast((frame) => frame.message.type === "subscribed")
  if (subscribed?.cursor === undefined) {
    throw new Error("expected subscribed to carry a cursor")
  }
  return subscribed.cursor
}

const okPromptTurn = () => async () => ({ ok: true as const })

const okAcceptPrompt = (): PromptAccept => async () => ({ ok: true })

const okCompletePromptTurn =
  (): PromptCompleteTurn =>
  async ({ outcome }) =>
    outcome

const okPromptDeps = () => ({
  runPromptTurn: okPromptTurn(),
  acceptPrompt: okAcceptPrompt(),
  completePromptTurn: okCompletePromptTurn(),
})

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
      ...okPromptDeps(),
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
      ...okPromptDeps(),
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
          m.type === "session_update" && (m.update as { text?: string }).text === "still-on-s1",
      ),
    ).toBe(true)
    expect(
      a.messages.some(
        (m) =>
          m.type === "session_update" && (m.update as { text?: string }).text === "still-on-s1",
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
      ...okPromptDeps(),
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

    expect(pending).resolves.toEqual({
      outcome: { outcome: "selected", optionId: "allow-once" },
    })
  })

  test("reply settlement reports settled, already_settled, and unknown", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const requestIds = { next: 0 }
    const hub = createSessionHub({
      cwdCache,
      createRequestId: () => `req-${++requestIds.next}`,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    const pending = hub.requestPermission({
      agentId: "cursor",
      sessionId: "s1",
      params: { toolCall: { toolCallId: "t1", name: "edit" } },
    })

    expect(hub.resolvePermissionReply({ requestId: "req-1", optionId: "allow-once" })).toBe(
      "settled",
    )
    expect(hub.resolvePermissionReply({ requestId: "req-1", optionId: "reject-once" })).toBe(
      "already_settled",
    )
    expect(hub.resolvePermissionReply({ requestId: "req-missing", optionId: "x" })).toBe("unknown")
    await pending
  })

  test("extension reply settlement reports settled, already_settled, and unknown", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const requestIds = { next: 0 }
    const hub = createSessionHub({
      cwdCache,
      createRequestId: () => `req-${++requestIds.next}`,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    const pending = hub.requestExtensionRpc({
      agentId: "cursor",
      sessionId: "s1",
      method: "cursor/ask_question",
      params: { question: "?" },
    })

    expect(hub.resolveExtensionReply({ requestId: "req-1", result: { ok: true } })).toBe("settled")
    expect(hub.resolveExtensionReply({ requestId: "req-1", result: { ok: false } })).toBe(
      "already_settled",
    )
    expect(hub.resolveExtensionReply({ requestId: "req-missing", result: {} })).toBe("unknown")
    expect(pending).resolves.toEqual({ ok: true })
  })

  test("cancel reports unknown_session and rejected failures", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: false, reason: "session/cancel failed: boom" }),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    expect(await hub.cancel({ agentId: "cursor", sessionId: "s1" })).toEqual({
      ok: false,
      error: { kind: "rejected", reason: "session/cancel failed: boom" },
    })
    expect(await hub.cancel({ agentId: "cursor", sessionId: "nope" })).toEqual({
      ok: false,
      error: { kind: "unknown_session", reason: "Unknown session cwd" },
    })
    expect(a.messages.some((m) => m.type === "cancelled")).toBe(false)
  })

  test("prompt is accepted before the turn completes", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    let releaseTurn: (() => void) | undefined
    let turnStarted = false
    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      runPromptTurn: async () => {
        turnStarted = true
        await new Promise<void>((resolve) => {
          releaseTurn = resolve
        })
        return { ok: true }
      },
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    const result = await hub.prompt({ agentId: "cursor", sessionId: "s1", text: "hello" })
    expect(result).toEqual({ ok: true })
    expect(turnStarted).toBe(true)
    expect(a.messages.some((m) => m.type === "prompt_complete")).toBe(false)

    releaseTurn?.()
    await hub.awaitPromptTurns()
    expect(a.messages.some((m) => m.type === "prompt_complete")).toBe(true)
  })

  test("prompt_complete and cancelled fan out to session subscribers", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    const b = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s1" })

    const result = await hub.prompt({
      agentId: "cursor",
      sessionId: "s1",
      text: "hello",
    })
    expect(result).toEqual({ ok: true })
    await hub.awaitPromptTurns()

    expect(a.messages.some((m) => m.type === "prompt_complete")).toBe(true)
    expect(b.messages.some((m) => m.type === "prompt_complete")).toBe(true)

    const cancelResult = await hub.cancel({
      agentId: "cursor",
      sessionId: "s1",
    })
    expect(cancelResult).toEqual({ ok: true })
    expect(a.messages.some((m) => m.type === "cancelled")).toBe(true)
    expect(b.messages.some((m) => m.type === "cancelled")).toBe(true)
  })

  test("prompt on an unknown session reports unknown_session", async () => {
    const hub = createSessionHub({
      cwdCache: createSessionCwdCache(),
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const result = await hub.prompt({
      agentId: "cursor",
      sessionId: "nope",
      text: "hello",
    })
    expect(result).toEqual({
      ok: false,
      error: { kind: "unknown_session", reason: "Unknown session cwd" },
    })
  })

  test("prompt refusal stops before the turn is queued", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    let turns = 0
    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      runPromptTurn: async () => {
        turns += 1
        return { ok: true }
      },
      acceptPrompt: async ({ attachments }) =>
        attachments !== undefined
          ? {
              ok: false,
              error: {
                kind: "rejected",
                reason:
                  "Agent does not advertise promptCapabilities.image — cannot attach shot.png",
              },
            }
          : { ok: false, error: { kind: "auth_gated", reason: AUTH_GATED_PROMPT_MESSAGE } },
      completePromptTurn: okCompletePromptTurn(),
      cancelSession: async () => ({ ok: true }),
    })

    expect(await hub.prompt({ agentId: "cursor", sessionId: "s1", text: "needs auth" })).toEqual({
      ok: false,
      error: { kind: "auth_gated", reason: AUTH_GATED_PROMPT_MESSAGE },
    })
    expect(
      await hub.prompt({
        agentId: "cursor",
        sessionId: "s1",
        text: "look",
        attachments: [
          {
            kind: "image",
            name: "shot.png",
            mimeType: "image/png",
            path: "/tmp/a/.harold/attachments/att_1.png",
          },
        ],
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: "rejected",
        reason: "Agent does not advertise promptCapabilities.image — cannot attach shot.png",
      },
    })

    expect(turns).toBe(0)
  })

  test("mid-turn prompt failure fans an error to session subscribers", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      runPromptTurn: async () => ({ ok: false, reason: "session/prompt failed: boom" }),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    const b = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s1" })

    const result = await hub.prompt({
      agentId: "cursor",
      sessionId: "s1",
      text: "hello",
    })
    expect(result).toEqual({ ok: true })
    await hub.awaitPromptTurns()

    const failure = (m: SessionStreamServerMessage) =>
      m.type === "error" && m.message === "session/prompt failed: boom"
    expect(a.messages.some(failure)).toBe(true)
    expect(b.messages.some(failure)).toBe(true)
    expect(a.messages.some((m) => m.type === "prompt_complete")).toBe(false)
    expect(b.messages.some((m) => m.type === "prompt_complete")).toBe(false)
  })

  test("concurrent prompts each run their own turn", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const started: string[] = []
    const releases: Array<() => void> = []
    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      runPromptTurn: async ({ text }) => {
        started.push(text)
        await new Promise<void>((resolve) => {
          releases.push(resolve)
        })
        return { ok: true }
      },
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    expect(await hub.prompt({ agentId: "cursor", sessionId: "s1", text: "first" })).toEqual({
      ok: true,
    })
    expect(await hub.prompt({ agentId: "cursor", sessionId: "s1", text: "second" })).toEqual({
      ok: true,
    })

    expect(started).toEqual(["first", "second"])

    for (const release of releases) {
      release()
    }
    await hub.awaitPromptTurns()
    expect(a.messages.filter((m) => m.type === "prompt_complete")).toHaveLength(2)
  })

  test("auth-gated turn outcomes run the challenge and fan the gated error", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    let challenges = 0
    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      runPromptTurn: async () => ({
        ok: false,
        reason: "Authentication required",
        authRequired: true,
      }),
      acceptPrompt: okAcceptPrompt(),
      completePromptTurn: makeCompletePromptTurn({
        ensureSessionFromChallenge: async () => {
          challenges += 1
        },
      }),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    const result = await hub.prompt({
      agentId: "cursor",
      sessionId: "s1",
      text: "hello",
    })
    expect(result).toEqual({ ok: true })
    await hub.awaitPromptTurns()

    expect(challenges).toBe(1)
    expect(a.messages.some((m) => m.type === "prompt_complete")).toBe(false)
    expect(
      a.messages.some((m) => m.type === "error" && m.message === AUTH_GATED_PROMPT_MESSAGE),
    ).toBe(true)
  })

  test("broadcastAuthSessionUpdated reaches agent subscribers", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })
    cwdCache.remember({ agentId: "cursor", sessionId: "s2", cwd: "/tmp/b" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    const b = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s2" })

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
      ...okPromptDeps(),
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
      ...okPromptDeps(),
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
          (m.update as { sessionUpdate?: string }).sessionUpdate === "available_commands_update",
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
      ...okPromptDeps(),
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
          (m.update as { sessionUpdate?: string }).sessionUpdate === "available_commands_update",
      ),
    ).toBe(true)
  })

  test("replays the latest usage update after a full replay", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/proj" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const first = {
      sessionUpdate: "usage_update",
      used: 84200,
      size: 200000,
      cost: { amount: 0.045, currency: "USD" },
    }
    const second = {
      sessionUpdate: "usage_update",
      used: 120000,
      size: 200000,
      cost: { amount: 0.09, currency: "USD" },
    }

    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: first })
    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: second })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    const usageUpdates = a.messages.filter(
      (m) =>
        m.type === "session_update" &&
        (m.update as { sessionUpdate?: string }).sessionUpdate === "usage_update",
    )
    expect(usageUpdates).toEqual([
      {
        type: "session_update",
        agentId: "cursor",
        sessionId: "s1",
        update: second,
      },
    ])
    const usageIndex = a.messages.findIndex((m) => m === usageUpdates[0])
    const subscribedIndex = a.messages.findIndex((m) => m.type === "subscribed")
    expect(usageIndex).toBeLessThan(subscribedIndex)
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
      ...okPromptDeps(),
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
      ...okPromptDeps(),
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

  test("a session that advertised config before any subscriber resends it on subscribe", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      // A resident session loads without the agent re-emitting config, so the
      // subscriber's only copy is the one the hub cached at advertise time.
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
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

  test("config captured during load reaches the joiner before subscribed", async () => {
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
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
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
      ...okPromptDeps(),
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

describe("session hub session info", () => {
  const rename = (title: string | null) => ({
    sessionUpdate: "session_info_update",
    title,
  })

  test("caches a pushed title with no subscriber and snapshots it to the joiner before subscribed", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/proj" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: rename("Fix the auth flow"),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    const info = a.messages.filter((m) => m.type === "session_info")
    expect(info).toEqual([
      {
        type: "session_info",
        agentId: "cursor",
        sessionId: "s1",
        title: "Fix the auth flow",
      },
    ])
    const subscribedIndex = a.messages.findIndex((m) => m.type === "subscribed")
    const infoIndex = a.messages.findIndex((m) => m.type === "session_info")
    expect(infoIndex).toBeGreaterThanOrEqual(0)
    expect(infoIndex).toBeLessThan(subscribedIndex)
  })

  test("live renames reach every connected client, including idle ones and other agents", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })
    cwdCache.remember({ agentId: "cursor", sessionId: "s2", cwd: "/tmp/b" })
    cwdCache.remember({ agentId: "opencode", sessionId: "s1", cwd: "/tmp/c" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    const b = collectSink()
    const c = collectSink()
    const idle = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })
    hub.addSubscriber({ id: "c", sink: c.sink, sessionKey: null })
    hub.addSubscriber({ id: "idle", sink: idle.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s2" })
    await hub.subscribe({ subscriberId: "c", agentId: "opencode", sessionId: "s1" })

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: rename("Renamed by the agent"),
    })

    expect(a.messages.filter((m) => m.type === "session_info")).toEqual([
      {
        type: "session_info",
        agentId: "cursor",
        sessionId: "s1",
        title: "Renamed by the agent",
      },
    ])
    expect(b.messages.filter((m) => m.type === "session_info")).toHaveLength(1)
    expect(c.messages.filter((m) => m.type === "session_info")).toHaveLength(1)
    expect(idle.messages.filter((m) => m.type === "session_info")).toEqual([
      {
        type: "session_info",
        agentId: "cursor",
        sessionId: "s1",
        title: "Renamed by the agent",
      },
    ])
  })

  test("repeated titles are not rebroadcast and marker updates are ignored", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: rename("Steady title"),
    })
    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: rename("Steady title"),
    })
    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "session_info_update", _meta: { opencode: { marker: "retry" } } },
    })

    expect(a.messages.filter((m) => m.type === "session_info")).toHaveLength(1)
  })

  test("a null title clears the cache and broadcasts one clear", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const a = collectSink()
    hub.addSubscriber({ id: "a", sink: a.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: rename(null) })
    expect(a.messages.filter((m) => m.type === "session_info")).toHaveLength(0)

    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: rename("First") })
    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: rename(null) })
    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: rename(null) })

    expect(a.messages.filter((m) => m.type === "session_info")).toEqual([
      { type: "session_info", agentId: "cursor", sessionId: "s1", title: "First" },
      { type: "session_info", agentId: "cursor", sessionId: "s1", title: null },
    ])

    const b = collectSink()
    hub.addSubscriber({ id: "b", sink: b.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "b", agentId: "cursor", sessionId: "s1" })
    expect(b.messages.filter((m) => m.type === "session_info")).toHaveLength(0)
  })

  test("resume with a valid cursor skips load and replays only missed events in order", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    let loadCount = 0
    const hub = createSessionHub({
      cwdCache,
      eventLog: createSessionEventLog({ createEpoch: () => "epoch" }),
      loadSession: async () => {
        loadCount += 1
        return { ok: true }
      },
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const first = collectSink()
    hub.addSubscriber({ id: "a", sink: first.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })

    expect(loadCount).toBe(1)
    expect(first.messages[0]?.type).toBe("stream_reset")
    const cursor = subscribedCursor(first.frames)

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "one" },
    })
    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "two" },
    })
    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "three" },
    })

    const liveCursors = first.frames
      .filter((frame) => frame.message.type === "session_update")
      .map((frame) => frame.cursor)
    expect(liveCursors).toEqual(["epoch:1", "epoch:2", "epoch:3"])

    hub.removeSubscriber("a")

    const resumed = collectSink()
    hub.addSubscriber({ id: "b", sink: resumed.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "b",
      agentId: "cursor",
      sessionId: "s1",
      lastEventId: cursor,
    })

    expect(loadCount).toBe(1)
    expect(resumed.messages.some((message) => message.type === "stream_reset")).toBe(false)
    expect(
      resumed.messages
        .filter((message) => message.type === "session_update")
        .map((message) => (message.update as { text?: string }).text),
    ).toEqual(["one", "two", "three"])
    expect(resumed.messages.map((message) => message.type)).toEqual([
      "session_update",
      "session_update",
      "session_update",
      "subscribed",
    ])
    expect(
      resumed.frames
        .filter((frame) => frame.message.type === "session_update")
        .map((frame) => frame.cursor),
    ).toEqual(["epoch:1", "epoch:2", "epoch:3"])
    expect(subscribedCursor(resumed.frames)).toBe("epoch:3")
  })

  test("resume with a stale cursor falls back to a full replay", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    let loadCount = 0
    const hub = createSessionHub({
      cwdCache,
      eventLog: createSessionEventLog({ capacity: 1, createEpoch: () => "epoch" }),
      loadSession: async ({ sessionId }) => {
        loadCount += 1
        hub.handleSessionUpdate({
          agentId: "cursor",
          sessionId,
          update: { sessionUpdate: "agent_message_chunk", text: "replayed" },
        })
        return { ok: true }
      },
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const first = collectSink()
    hub.addSubscriber({ id: "a", sink: first.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    const staleCursor = subscribedCursor(first.frames)

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "one" },
    })
    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "two" },
    })

    hub.removeSubscriber("a")

    const replayed = collectSink()
    hub.addSubscriber({ id: "b", sink: replayed.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "b",
      agentId: "cursor",
      sessionId: "s1",
      lastEventId: staleCursor,
    })

    expect(loadCount).toBe(2)
    expect(replayed.messages[0]?.type).toBe("stream_reset")
    expect(
      replayed.messages.some(
        (message) =>
          message.type === "session_update" &&
          (message.update as { text?: string }).text === "replayed",
      ),
    ).toBe(true)
    expect(replayed.messages.at(-1)?.type).toBe("subscribed")
    expect(subscribedCursor(replayed.frames)).toBe("epoch:2")
  })

  test("resume resends cached config and commands after catch-up", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      eventLog: createSessionEventLog({ createEpoch: () => "epoch" }),
      commandsCache: createCommandsCache(),
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const commands = {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "web", description: "Search" }],
    }
    const config = [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select" as const,
        currentValue: "m1",
        options: [{ value: "m1", name: "M1" }],
      },
    ]
    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: commands })
    hub.handleSessionConfig({ agentId: "cursor", sessionId: "s1", configOptions: config })

    const first = collectSink()
    hub.addSubscriber({ id: "a", sink: first.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    expect(first.messages.some((message) => message.type === "session_config")).toBe(true)
    expect(first.messages.some((message) => message.type === "session_update")).toBe(true)
    const cursor = subscribedCursor(first.frames)

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "missed" },
    })
    hub.removeSubscriber("a")

    const resumed = collectSink()
    hub.addSubscriber({ id: "b", sink: resumed.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "b",
      agentId: "cursor",
      sessionId: "s1",
      lastEventId: cursor,
    })

    expect(resumed.messages.map((message) => message.type)).toEqual([
      "session_update",
      "session_config",
      "session_update",
      "subscribed",
    ])
    expect(resumed.messages[0]).toMatchObject({
      type: "session_update",
      update: { sessionUpdate: "agent_message_chunk", text: "missed" },
    })
    expect(resumed.messages[1]).toMatchObject({
      type: "session_config",
      configOptions: config,
    })
    expect(resumed.messages[2]).toMatchObject({
      type: "session_update",
      update: commands,
    })
  })

  test("resume resends cached usage after catch-up", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      eventLog: createSessionEventLog({ createEpoch: () => "epoch" }),
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const usage = {
      sessionUpdate: "usage_update",
      used: 84200,
      size: 200000,
      cost: { amount: 0.045, currency: "USD" },
    }
    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: usage })

    const first = collectSink()
    hub.addSubscriber({ id: "a", sink: first.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    const cursor = subscribedCursor(first.frames)

    hub.handleSessionUpdate({
      agentId: "cursor",
      sessionId: "s1",
      update: { sessionUpdate: "agent_message_chunk", text: "missed" },
    })
    hub.removeSubscriber("a")

    const resumed = collectSink()
    hub.addSubscriber({ id: "b", sink: resumed.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "b",
      agentId: "cursor",
      sessionId: "s1",
      lastEventId: cursor,
    })

    expect(resumed.messages.map((message) => message.type)).toEqual([
      "session_update",
      "session_update",
      "subscribed",
    ])
    expect(resumed.messages[0]).toMatchObject({
      update: { sessionUpdate: "agent_message_chunk", text: "missed" },
    })
    expect(resumed.messages[1]).toMatchObject({ update: usage })
  })

  test("resume catches up a title rename that happened while disconnected", async () => {
    const cwdCache = createSessionCwdCache()
    cwdCache.remember({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/a" })

    const hub = createSessionHub({
      cwdCache,
      eventLog: createSessionEventLog({ createEpoch: () => "epoch" }),
      loadSession: async () => ({ ok: true }),
      ...okPromptDeps(),
      cancelSession: async () => ({ ok: true }),
    })

    const first = collectSink()
    hub.addSubscriber({ id: "a", sink: first.sink, sessionKey: null })
    await hub.subscribe({ subscriberId: "a", agentId: "cursor", sessionId: "s1" })
    const cursor = subscribedCursor(first.frames)
    hub.removeSubscriber("a")

    hub.handleSessionUpdate({ agentId: "cursor", sessionId: "s1", update: rename("Picked up") })

    const resumed = collectSink()
    hub.addSubscriber({ id: "b", sink: resumed.sink, sessionKey: null })
    await hub.subscribe({
      subscriberId: "b",
      agentId: "cursor",
      sessionId: "s1",
      lastEventId: cursor,
    })

    expect(resumed.messages).toContainEqual({
      type: "session_info",
      agentId: "cursor",
      sessionId: "s1",
      title: "Picked up",
    })
  })
})
