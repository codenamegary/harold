import { describe, expect, test } from "bun:test"
import { AURORA_WORKSPACE_PATH } from "../src/fixtures/workspaces"
import {
  authedFetch,
  claimDevice,
  openSse,
  startTestServer,
  TestFrame,
  TestServer,
  TestSse,
} from "./support"

const SESSION_ID = "ses_demo_add_dark_mode_toggle"

const prompt = async (server: TestServer, credential: string, text: string): Promise<Response> =>
  authedFetch(server, credential, `/v1/sessions/${SESSION_ID}/prompts?agentId=opencode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  })

const replyPermission = async (
  server: TestServer,
  credential: string,
  requestId: string,
): Promise<Response> =>
  authedFetch(server, credential, `/v1/permissions/${requestId}/replies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ optionId: "allow-once" }),
  })

const replyElicitation = async (
  server: TestServer,
  credential: string,
  requestId: string,
): Promise<Response> =>
  authedFetch(server, credential, `/v1/elicitations/${requestId}/replies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Invalid JSON on purpose: the route must not read this body.
    body: "{this is not json",
  })

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null

const updateKind = (frame: TestFrame): string | null => {
  if (frame.type !== "session_update") {
    return null
  }
  const update = asRecord(frame.update)
  return typeof update?.sessionUpdate === "string" ? update.sessionUpdate : null
}

const updateText = (frame: TestFrame): string | null => {
  if (frame.type !== "session_update") {
    return null
  }
  const update = asRecord(frame.update)
  const content = asRecord(update?.content)
  return typeof content?.text === "string" ? content.text : null
}

const permissionRequestId = (frame: TestFrame): string => {
  if (frame.type !== "permission_request") {
    throw new Error(`Expected permission_request, got ${frame.type}`)
  }
  return frame.requestId
}

const elicitationRequestId = (frame: TestFrame): string => {
  if (frame.type !== "elicitation_request") {
    throw new Error(`Expected elicitation_request, got ${frame.type}`)
  }
  return frame.requestId
}

const openAtReplayEnd = async (
  server: TestServer,
  credential: string,
): Promise<{ sse: TestSse; index: number }> => {
  const sse = await openSse({ server, credential, sessionId: SESSION_ID })
  const end = await sse.waitFor((frame) => frame.type === "prompt_complete")
  return { sse, index: end.index }
}

const runTurnOne = async (
  server: TestServer,
  credential: string,
): Promise<{ frames: TestFrame[]; sse: TestSse; start: number; end: number }> => {
  const { sse, index } = await openAtReplayEnd(server, credential)
  const start = index + 1
  expect((await prompt(server, credential, "first prompt")).status).toBe(202)

  const permission = await sse.waitFor((frame) => frame.type === "permission_request", {
    after: start,
  })
  expect(
    sse.frames.slice(permission.index + 1).some((frame) => frame.type === "prompt_complete"),
  ).toBe(false)
  expect(
    (await replyPermission(server, credential, permissionRequestId(permission.frame))).status,
  ).toBe(204)

  const elicitation = await sse.waitFor((frame) => frame.type === "elicitation_request", {
    after: permission.index + 1,
  })
  expect(
    sse.frames.slice(elicitation.index + 1).some((frame) => frame.type === "prompt_complete"),
  ).toBe(false)
  expect(
    (await replyElicitation(server, credential, elicitationRequestId(elicitation.frame))).status,
  ).toBe(204)

  const end = await sse.waitFor((frame) => frame.type === "prompt_complete", {
    after: elicitation.index + 1,
  })
  return { frames: sse.frames.slice(start, end.index + 1), sse, start, end: end.index }
}

const runCannedTurn = async (
  server: TestServer,
  credential: string,
  text: string,
): Promise<{ frames: TestFrame[]; sse: TestSse; start: number; end: number }> => {
  const { sse, index } = await openAtReplayEnd(server, credential)
  const start = index + 1
  expect((await prompt(server, credential, text)).status).toBe(202)
  const end = await sse.waitFor((frame) => frame.type === "prompt_complete", { after: start })
  return { frames: sse.frames.slice(start, end.index + 1), sse, start, end: end.index }
}

const runLimitTurn = async (
  server: TestServer,
  credential: string,
  text: string,
): Promise<{ frames: TestFrame[]; sse: TestSse; start: number; end: number }> => {
  return runCannedTurn(server, credential, text)
}

const withServer = async (testBody: (server: TestServer) => Promise<void>) => {
  const server = startTestServer()
  try {
    await testBody(server)
  } finally {
    await server.stop()
  }
}

describe("scripted turns", () => {
  test("turn 1 waits for the permission and question panels", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential
      const { frames, sse } = await runTurnOne(server, credential)
      try {
        const kinds = frames.map(updateKind).filter((kind) => kind !== null)
        expect(kinds).toContain("agent_thought_chunk")
        expect(kinds).toContain("agent_message_chunk")
        expect(kinds).toContain("tool_call")
        expect(kinds).toContain("tool_call_update")
        expect(kinds).toContain("usage_update")
        expect(kinds).not.toContain("user_message_chunk")

        const statuses = frames
          .filter(
            (frame) =>
              updateKind(frame) === "tool_call" || updateKind(frame) === "tool_call_update",
          )
          .map((frame) => {
            if (frame.type !== "session_update") {
              return null
            }
            const status = asRecord(frame.update)?.status
            return typeof status === "string" ? status : null
          })
        expect(statuses).toContain("pending")
        expect(statuses).toContain("in_progress")
        expect(statuses).toContain("completed")
        expect(statuses).toContain("failed")

        const toolKinds = frames
          .filter((frame) => updateKind(frame) === "tool_call")
          .map((frame) => {
            if (frame.type !== "session_update") {
              return null
            }
            const kind = asRecord(frame.update)?.toolKind
            return typeof kind === "string" ? kind : null
          })
        expect(toolKinds).toEqual(["read", "execute", "edit"])

        const assistantMessages = frames
          .filter((frame) => updateKind(frame) === "agent_message_chunk")
          .map(updateText)
          .filter((value): value is string => value !== null)
        expect(assistantMessages[0]).toContain("run the theme tests")
        expect(assistantMessages.at(-1)).toContain("contrast fix")
        expect(frames.some((frame) => frame.type === "extension_request")).toBe(false)

        const usage = frames.find((frame) => updateKind(frame) === "usage_update")
        expect(usage).toBeDefined()
        if (usage !== undefined && usage.type === "session_update") {
          expect(usage.update).toMatchObject({
            used: expect.any(Number),
            size: expect.any(Number),
            cost: { amount: expect.any(Number), currency: "USD" },
          })
        }

        expect(frames.filter((frame) => frame.type === "prompt_complete")).toHaveLength(1)
        expect(frames.some((frame) => frame.type === "elicitation_resolved")).toBe(true)
      } finally {
        await sse.close()
      }
    })
  })

  test("seeded transcript is an in-progress review, not a completed one", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const sse = await openSse({
        server,
        credential: claimed.credential,
        sessionId: SESSION_ID,
      })
      try {
        const end = await sse.waitFor((frame) => frame.type === "prompt_complete")
        const text = sse.frames
          .slice(0, end.index + 1)
          .map(updateText)
          .filter((value): value is string => value !== null)
          .join("\n")
        expect(text).toContain("The user wants me to review the dark mode toggle")
        expect(text).toContain("I found a contrast issue")
        expect(text).not.toContain("Review complete")
      } finally {
        await sse.close()
      }
    })
  })

  test("turn 2 and turn 3 are canned replies with no panels", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential
      const first = await runTurnOne(server, credential)
      await first.sse.close()

      const second = await runCannedTurn(server, credential, "second prompt")
      expect(second.frames.some((frame) => frame.type === "permission_request")).toBe(false)
      expect(second.frames.some((frame) => frame.type === "elicitation_request")).toBe(false)
      expect(second.frames.some((frame) => frame.type === "extension_request")).toBe(false)
      expect(
        second.frames.filter((frame) => updateKind(frame) === "agent_thought_chunk"),
      ).toHaveLength(1)
      expect(second.frames.filter((frame) => frame.type === "prompt_complete")).toHaveLength(1)
      expect(
        second.frames.filter((frame) => updateKind(frame) === "tool_call").length,
      ).toBeGreaterThan(0)
      await second.sse.close()

      const third = await runCannedTurn(server, credential, "third prompt")
      expect(third.frames.filter((frame) => frame.type === "prompt_complete")).toHaveLength(1)
      await third.sse.close()

      const session = server.app.store.getSession(claimed.deviceId, SESSION_ID)
      expect(session?.turns).toHaveLength(3)
      expect(session?.turns[1]?.cannedIndex).toBeGreaterThanOrEqual(0)
      expect(session?.turns[1]?.cannedIndex).toBeLessThan(3)
      expect(session?.turns[2]?.cannedIndex).toBeGreaterThanOrEqual(0)
    })
  })

  test("turn 4 and later return the static limit block without writing state", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential
      const first = await runTurnOne(server, credential)
      await first.sse.close()
      const second = await runCannedTurn(server, credential, "second")
      await second.sse.close()
      const third = await runCannedTurn(server, credential, "third")
      await third.sse.close()

      const sessionBefore = server.app.store.getSession(claimed.deviceId, SESSION_ID)
      const turnsBefore = sessionBefore?.turns.length ?? 0

      const fourth = await runLimitTurn(server, credential, "fourth")
      try {
        const text = fourth.frames
          .map(updateText)
          .filter((value): value is string => value !== null)
          .join("\n")
        expect(text).toContain("end of the demo conversation")
        expect(text).toContain("15 minutes")
        expect(fourth.frames.filter((frame) => frame.type === "prompt_complete")).toHaveLength(1)
      } finally {
        await fourth.sse.close()
      }

      const sessionAfter = server.app.store.getSession(claimed.deviceId, SESSION_ID)
      expect(sessionAfter?.turns.length).toBe(turnsBefore)
      expect(sessionAfter?.turns.length).toBe(3)

      const fifth = await runLimitTurn(server, credential, "fifth")
      await fifth.sse.close()
      expect(server.app.store.getSession(claimed.deviceId, SESSION_ID)?.turns.length).toBe(3)
    })
  })

  test("reconnect replays canned choices but not open panels or prompt text", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential
      const secret = "SECRET_PROMPT_TEXT_SHOULD_NEVER_ECHO"

      const first = await runTurnOne(server, credential)
      await first.sse.close()
      const second = await runCannedTurn(server, credential, secret)
      const secondAssistant = second.frames
        .filter((frame) => updateKind(frame) === "agent_message_chunk")
        .map(updateText)
        .filter((value): value is string => value !== null)
      await second.sse.close()
      const third = await runCannedTurn(server, credential, "third prompt")
      await third.sse.close()

      const replay = await openSse({ server, credential, sessionId: SESSION_ID })
      try {
        await replay.waitFor((frame) => frame.type === "prompt_complete", { timeoutMs: 4_000 })
        const serialized = JSON.stringify(replay.frames)
        expect(serialized).not.toContain(secret)
        expect(serialized).toContain("[prompt text omitted in demo]")

        const replayAssistant = replay.frames
          .map(updateText)
          .filter((value): value is string => value !== null)
        expect(secondAssistant.length).toBeGreaterThan(0)
        for (const message of secondAssistant) {
          expect(replayAssistant).toContain(message)
        }

        expect(replay.frames.some((frame) => frame.type === "permission_request")).toBe(false)
        expect(replay.frames.some((frame) => frame.type === "elicitation_request")).toBe(false)
        expect(replay.frames.some((frame) => frame.type === "extension_request")).toBe(false)
        expect(replay.frames.some((frame) => frame.type === "elicitation_resolved")).toBe(true)

        const limitMessages = replay.frames
          .map(updateText)
          .filter(
            (value): value is string =>
              value !== null && value.includes("end of the demo conversation"),
          )
        expect(limitMessages).toHaveLength(1)
      } finally {
        await replay.close()
      }

      expect(server.app.store.getSession(claimed.deviceId, SESSION_ID)?.turns).toHaveLength(3)
    })
  })

  test("cancel emits cancelled and ends the turn", async () => {
    await withServer(async (server) => {
      const claimed = await claimDevice(server)
      const credential = claimed.credential
      const { sse, index } = await openAtReplayEnd(server, credential)
      const start = index + 1
      try {
        expect((await prompt(server, credential, "cancel this")).status).toBe(202)
        await sse.waitFor((frame) => frame.type === "permission_request", { after: start })
        const cancelled = await authedFetch(
          server,
          credential,
          `/v1/sessions/${SESSION_ID}/cancel?agentId=opencode`,
          { method: "POST", body: "{}" },
        )
        expect(cancelled.status).toBe(204)
        const frame = await sse.waitFor((message) => message.type === "cancelled", { after: start })
        expect(
          sse.frames.slice(frame.index + 1).some((message) => message.type === "prompt_complete"),
        ).toBe(false)
      } finally {
        await sse.close()
      }
    })
  })
})

describe("state isolation and lifecycle", () => {
  test("two credentials get separate state", async () => {
    await withServer(async (server) => {
      const first = await claimDevice(server, "AAA-111")
      const second = await claimDevice(server, "BBB-222")
      expect(first.deviceId).not.toBe(second.deviceId)

      const created = await authedFetch(server, first.credential, "/v1/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "folder", path: "/home/demo/projects/only-first" }),
      })
      expect(created.status).toBe(201)

      const firstList = await authedFetch(server, first.credential, "/v1/workspaces")
      const secondList = await authedFetch(server, second.credential, "/v1/workspaces")
      const firstNames = ((await firstList.json()) as { items: Array<{ name: string }> }).items.map(
        (item) => item.name,
      )
      const secondNames = (
        (await secondList.json()) as { items: Array<{ name: string }> }
      ).items.map((item) => item.name)
      expect(firstNames).toContain("only-first")
      expect(secondNames).not.toContain("only-first")

      const firstSession = await authedFetch(server, first.credential, "/v1/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: "opencode", cwd: AURORA_WORKSPACE_PATH }),
      })
      const firstSessionBody = (await firstSession.json()) as { sessionId: string }

      const crossStream = await fetch(
        `${server.url}/v1/sessions/${firstSessionBody.sessionId}/events?agentId=opencode`,
        { headers: { authorization: `Bearer ${second.credential}` } },
      )
      expect(crossStream.status).toBe(404)
      await crossStream.body?.cancel()
    })
  })

  test("a restart keeps the same credential valid", async () => {
    const first = startTestServer()
    const claimed = await claimDevice(first)
    await first.stop()

    const second = startTestServer()
    try {
      const response = await authedFetch(second, claimed.credential, "/v1/workspaces")
      expect(response.status).toBe(200)
      const body = (await response.json()) as { items: Array<{ name: string }> }
      expect(body.items.map((item) => item.name)).toEqual(["aurora-web", "pixel-garden"])
    } finally {
      await second.stop()
    }
  })

  test("the reaper removes sessions at 15 minutes even after activity, and reseeds", async () => {
    const clock = { nowMs: Date.parse("2026-11-03T12:00:00.000Z") }
    const server = startTestServer({
      now: () => clock.nowMs,
      reaperIntervalMs: 60 * 60 * 1000,
    })
    try {
      const claimed = await claimDevice(server)
      const deviceId = claimed.deviceId
      const session = server.app.store.getSession(deviceId, SESSION_ID)
      expect(session).toBeDefined()
      const originalExpiry = session?.expiresAt
      expect(originalExpiry).toBe(clock.nowMs + 15 * 60 * 1000)

      clock.nowMs += 10 * 60 * 1000
      const activity = await authedFetch(server, claimed.credential, "/v1/sessions")
      expect(activity.status).toBe(200)
      clock.nowMs += 4 * 60 * 1000
      server.app.store.reap()
      expect(server.app.store.listSessions(deviceId).length).toBe(3)
      expect(server.app.store.getSession(deviceId, SESSION_ID)?.expiresAt).toBe(originalExpiry)

      clock.nowMs += 60 * 1000 + 1
      server.app.store.reap()
      expect(server.app.store.listSessions(deviceId)).toHaveLength(0)

      const reseeded = await authedFetch(server, claimed.credential, "/v1/sessions")
      expect(reseeded.status).toBe(200)
      const rows = (await reseeded.json()) as { items: Array<{ title: string }> }
      expect(rows.items.map((item) => item.title)).toEqual([
        "Add dark mode toggle",
        "Fix image resize bug",
        "Review the release notes",
      ])
    } finally {
      await server.stop()
    }
  })

  test("session creation uses a fixed 15 minute expiry that activity does not extend", async () => {
    const clock = { nowMs: Date.parse("2026-11-03T12:00:00.000Z") }
    const server = startTestServer({
      now: () => clock.nowMs,
      reaperIntervalMs: 60 * 60 * 1000,
    })
    try {
      const claimed = await claimDevice(server)
      const created = await authedFetch(server, claimed.credential, "/v1/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: "opencode", cwd: AURORA_WORKSPACE_PATH }),
      })
      const session = (await created.json()) as { sessionId: string }
      const stored = server.app.store.getSession(claimed.deviceId, session.sessionId)
      expect(stored?.expiresAt).toBe(clock.nowMs + 15 * 60 * 1000)

      clock.nowMs += 5 * 60 * 1000
      await authedFetch(server, claimed.credential, "/v1/sessions")
      const unchanged = server.app.store.getSession(claimed.deviceId, session.sessionId)
      expect(unchanged?.expiresAt).toBe(clock.nowMs - 5 * 60 * 1000 + 15 * 60 * 1000)
    } finally {
      await server.stop()
    }
  })
})
