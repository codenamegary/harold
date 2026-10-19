import { describe, expect, test } from "bun:test"
import {
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  UnauthorizedProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { DEVICES_PATH, DeviceCollectionSchema, devicePath } from "contracts/http/device"
import { sessionEventsPath } from "contracts/http/session.stream"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { createSessionCommands, openSseStream } from "test-support/session-stream"
import { enableAgent } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

type ListeningApp = {
  listen: (opts: { host: string; port: number }) => Promise<string>
  server: { address: () => unknown }
}

const getHttpBase = async (app: ListeningApp, host: string) => {
  await app.listen({ host, port: 0 })
  const address = app.server.address()
  if (
    address === null ||
    typeof address !== "object" ||
    !("port" in address) ||
    typeof address.port !== "number"
  ) {
    throw new Error("expected bound server address")
  }
  return `http://${host}:${address.port}`
}

const eventsUrl = (httpBase: string, sessionId: string) =>
  `${httpBase}${sessionEventsPath(sessionId, { agentId: "cursor" })}`

const createSession = async (
  app: {
    deviceCredential: { credential: string }
    inject: (opts: {
      headers: Record<string, string>
      method: "POST"
      url: string
      payload: unknown
    }) => Promise<{ statusCode: number; body: string }>
  },
  cwd: string,
) => {
  const response = await app.inject({
    headers: authHeaders(app),
    method: "POST",
    url: "/v1/sessions",
    payload: { agentId: "cursor", cwd },
  })
  expect(response.statusCode).toBe(201)
  return CreateSessionResponseSchema.parse(JSON.parse(response.body))
}

describe("GET /v1/sessions/:sessionId/events", () => {
  test("streams SSE headers and sends subscribed last after load replay", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-basic-1",
        sessionLoadSessionId: "sse-basic-1",
        emitLoadReplayUpdates: true,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)

    const created = await createSession(app, "/tmp/sse-basic")
    const stream = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
    })

    const subscribed = await stream.waitFor((message) => message.type === "subscribed")
    expect(subscribed).toMatchObject({
      type: "subscribed",
      agentId: "cursor",
      sessionId: created.sessionId,
    })

    const replayIndex = stream.messages.findIndex((message) => message.type === "session_update")
    const subscribedIndex = stream.messages.findIndex((message) => message.type === "subscribed")
    expect(replayIndex).toBeGreaterThanOrEqual(0)
    expect(replayIndex).toBeLessThan(subscribedIndex)
    expect(stream.messages.some((message) => message.type === "error")).toBe(false)

    await stream.close()
  }, 30_000)

  test("resumes from a valid cursor without replaying the session", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-resume-1",
        sessionLoadSessionId: "sse-resume-1",
        emitLoadReplayUpdates: true,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)

    const created = await createSession(app, "/tmp/sse-resume")
    const first = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
    })
    await first.waitFor((message) => message.type === "subscribed")

    expect(first.messages[0]?.type).toBe("stream_reset")
    expect(
      first.messages.some(
        (message) =>
          message.type === "session_update" && JSON.stringify(message.update).includes("Replayed"),
      ),
    ).toBe(true)
    const cursor = first.lastEventId
    expect(cursor).not.toBeNull()
    await first.close()

    const resumed = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
      ...(cursor === null ? {} : { lastEventId: cursor }),
    })
    await resumed.waitFor((message) => message.type === "subscribed")

    expect(resumed.messages.some((message) => message.type === "stream_reset")).toBe(false)
    expect(
      resumed.messages.some(
        (message) =>
          message.type === "session_update" && JSON.stringify(message.update).includes("Replayed"),
      ),
    ).toBe(false)
    const subscribed = resumed.events.find((event) => event.message.type === "subscribed")
    expect(subscribed?.id).not.toBeNull()

    await resumed.close()
  }, 30_000)

  test("resumes with every event missed while disconnected, in order", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-catch-up-1",
        sessionLoadSessionId: "sse-catch-up-1",
        emitLoadReplayUpdates: true,
        emitSessionUpdatesOnPrompt: true,
        promptCompletionDelayMs: 50,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)
    const commands = createSessionCommands({
      httpBase,
      credential: app.deviceCredential.credential,
    })

    const created = await createSession(app, "/tmp/sse-catch-up")
    const first = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
    })
    await first.waitFor((message) => message.type === "subscribed")
    const cursor = first.lastEventId
    expect(cursor).not.toBeNull()
    await first.close()

    const promptResponse = await commands.prompt({
      agentId: "cursor",
      sessionId: created.sessionId,
      text: "while disconnected",
    })
    expect(promptResponse.status).toBe(202)
    await new Promise((resolve) => setTimeout(resolve, 250))

    const resumed = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
      ...(cursor === null ? {} : { lastEventId: cursor }),
    })
    await resumed.waitFor((message) => message.type === "prompt_complete")

    expect(resumed.messages.some((message) => message.type === "stream_reset")).toBe(false)
    const caughtUpText = resumed.messages.flatMap((message) => {
      if (message.type !== "session_update") {
        return []
      }
      const update = message.update as { content?: { text?: string } }
      return update.content?.text === undefined ? [] : [update.content.text]
    })
    expect(caughtUpText).toEqual(["Hello", " world"])

    await resumed.close()
  }, 30_000)

  test("falls back to a full replay for a stale cursor", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-stale-1",
        sessionLoadSessionId: "sse-stale-1",
        emitLoadReplayUpdates: true,
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)

    const created = await createSession(app, "/tmp/sse-stale")
    const stream = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
      lastEventId: "stale-cursor",
    })

    await stream.waitFor((message) => message.type === "subscribed")
    expect(stream.messages[0]?.type).toBe("stream_reset")
    expect(
      stream.messages.some(
        (message) =>
          message.type === "session_update" && JSON.stringify(message.update).includes("Replayed"),
      ),
    ).toBe(true)

    await stream.close()
  }, 30_000)

  test("responds with event-stream headers", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-headers-1",
        sessionLoadSessionId: "sse-headers-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)

    const created = await createSession(app, "/tmp/sse-headers")
    const controller = new AbortController()
    const response = await fetch(eventsUrl(httpBase, created.sessionId), {
      headers: { ...authHeaders(app), accept: "text/event-stream" },
      signal: controller.signal,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    expect(response.headers.get("cache-control")).toBe("no-cache")
    expect(response.headers.get("x-accel-buffering")).toBe("no")

    controller.abort()
  }, 30_000)

  test("returns a 404 problem for an unknown session without opening a stream", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getHttpBase(app, config.host)

    const response = await fetch(eventsUrl(httpBase, "nope"), {
      headers: authHeaders(app),
    })

    expect(response.status).toBe(404)
    const problem = NotFoundProblemSchema.parse(await response.json())
    expect(problem.type).toBe(PROBLEM_TYPES.notFound)
  })

  test("returns a 400 problem for a missing agent id", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getHttpBase(app, config.host)

    const response = await fetch(`${httpBase}/v1/sessions/s1/events`, {
      headers: authHeaders(app),
    })

    expect(response.status).toBe(400)
    const problem = ValidationProblemSchema.parse(await response.json())
    expect(problem.type).toBe(PROBLEM_TYPES.validationError)
  })

  test("rejects unauthenticated streams with a 401 problem", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getHttpBase(app, config.host)

    const response = await fetch(`${httpBase}/v1/sessions/s1/events?agentId=cursor`)

    expect(response.status).toBe(401)
    const problem = UnauthorizedProblemSchema.parse(await response.json())
    expect(problem.type).toBe(PROBLEM_TYPES.unauthorized)
  })

  test("sends ping heartbeat comments while the stream is open", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-heartbeat-1",
        sessionLoadSessionId: "sse-heartbeat-1",
      },
      sseHeartbeatMs: 50,
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)

    const created = await createSession(app, "/tmp/sse-heartbeat")
    const stream = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
    })
    await stream.waitFor((message) => message.type === "subscribed")

    const startedAt = Date.now()
    while (stream.heartbeats < 2) {
      if (Date.now() - startedAt > 5_000) {
        throw new Error(`timeout waiting for heartbeats. seen: ${stream.heartbeats}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(stream.heartbeats).toBeGreaterThanOrEqual(2)

    await stream.close()
  }, 30_000)

  test("client disconnect releases the subscriber and flips presence offline", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-presence-1",
        sessionLoadSessionId: "sse-presence-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)

    const created = await createSession(app, "/tmp/sse-presence")
    const stream = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
    })
    await stream.waitFor((message) => message.type === "subscribed")

    const startedAt = Date.now()
    for (;;) {
      const listed = DeviceCollectionSchema.parse(
        await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
      )
      if (listed.items[0]?.state === "online") {
        break
      }
      if (Date.now() - startedAt > 5_000) {
        throw new Error("timeout waiting for device presence")
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    await stream.close()

    const startedAt2 = Date.now()
    for (;;) {
      const listed = DeviceCollectionSchema.parse(
        await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
      )
      if (listed.items[0]?.state === "offline") {
        break
      }
      if (Date.now() - startedAt2 > 5_000) {
        throw new Error("timeout waiting for device presence release")
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }, 30_000)

  test("revocation ends the open stream and the credential is refused afterwards", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-revoke-1",
        sessionLoadSessionId: "sse-revoke-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)

    const created = await createSession(app, "/tmp/sse-revoke")
    const stream = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
    })
    await stream.waitFor((message) => message.type === "subscribed")

    const endPromise = stream.waitForEnd()
    const revokeResponse = await fetch(`${httpBase}${devicePath(app.deviceCredential.deviceId)}`, {
      method: "DELETE",
      headers: authHeaders(app),
    })
    expect(revokeResponse.status).toBe(204)
    await endPromise

    const reopenResponse = await fetch(eventsUrl(httpBase, created.sessionId), {
      headers: authHeaders(app),
    })
    expect(reopenResponse.status).toBe(401)
    UnauthorizedProblemSchema.parse(await reopenResponse.json())
  }, 30_000)

  test("server shutdown ends open streams", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "sse-shutdown-1",
        sessionLoadSessionId: "sse-shutdown-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const httpBase = await getHttpBase(app, config.host)

    const created = await createSession(app, "/tmp/sse-shutdown")
    const stream = await openSseStream({
      url: eventsUrl(httpBase, created.sessionId),
      credential: app.deviceCredential.credential,
    })
    await stream.waitFor((message) => message.type === "subscribed")

    const endPromise = stream.waitForEnd()
    await app.close()
    await endPromise
  }, 30_000)
})
