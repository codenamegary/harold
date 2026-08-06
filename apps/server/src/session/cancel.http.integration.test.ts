import { afterEach, describe, expect, test } from "bun:test"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import {
  CancelSessionResponseSchema,
  PromptSessionResponseSchema,
  CreateSessionResponseSchema,
  SessionSchema,
} from "contracts/http/session"
import { WebSocket } from "ws"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedWorkspace,
} from "../test-support/create-test-app"
import { Config } from "../config/config"

const resources = createTestAppResources()

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

const getListeningUrl = async (
  app: {
    listen: (opts: { host: string; port: number }) => Promise<string>
    server: { address: () => unknown }
  },
  config: Config,
) => {
  await app.listen({ host: config.host, port: 0 })
  const address = app.server.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected bound server address")
  }

  return {
    httpBase: `http://${config.host}:${address.port}`,
    wsUrl: `ws://${config.host}:${address.port}/v1/events`,
  }
}

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 5000) => {
  const startedAt = Date.now()
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const collectEventsUntil = (params: {
  url: string
  until: (events: Event[]) => boolean
  timeoutMs?: number
}): { eventsPromise: Promise<Event[]>; whenOpen: Promise<void> } => {
  const openState: { resolve: (() => void) | undefined } = { resolve: undefined }

  const whenOpen = new Promise<void>((resolve) => {
    openState.resolve = resolve
  })

  const eventsPromise = new Promise<Event[]>((resolve, reject) => {
    const ws = new WebSocket(params.url)
    const events: Event[] = []
    const timeoutMs = params.timeoutMs ?? 5000
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("timed out collecting websocket events"))
    }, timeoutMs)

    ws.addEventListener("open", () => {
      openState.resolve?.()
    })

    ws.addEventListener("message", (event) => {
      const frame = EventFrameSchema.parse(JSON.parse(String(event.data)))
      events.push(...frame)
      if (params.until(events)) {
        clearTimeout(timeout)
        ws.close()
        resolve(events)
      }
    })

    ws.addEventListener("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })

  return { eventsPromise, whenOpen }
}

describe("HTTP cancel accept-and-stream", () => {
  test("prompt → cancel → idle → second prompt", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      undefined,
      {
        capabilities: { loadSession: true, sessionClose: true },
        sessionNewSessionId: "fake-session-cancel-http",
        sessionLoadSessionId: "fake-session-cancel-http",
        emitSessionUpdatesOnPrompt: true,
      },
    )

    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        text: "Cancel stream",
      },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))
    expect(session.state).toBe("running")

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

    const { httpBase, wsUrl } = await getListeningUrl(app, config)
    const { eventsPromise, whenOpen } = collectEventsUntil({
      url: `${wsUrl}?sessionId=${session.id}`,
      until: (events) =>
        events.some((event) => event.type === "turn.cancelled") &&
        events.some(
          (event) =>
            event.type === "session.state" &&
            event.payload.state === "stopping",
        ) &&
        events.some(
          (event) =>
            event.type === "session.state" &&
            event.payload.state === "idle" &&
            events.some(
              (prior) =>
                prior.type === "session.state" && prior.payload.state === "running",
            ),
        ),
    })

    await whenOpen

    const promptResponse = await fetch(`${httpBase}/v1/sessions/${session.id}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "first prompt to cancel" }),
    })
    expect(promptResponse.status).toBe(202)
    const promptBody = PromptSessionResponseSchema.parse(await promptResponse.json())

    const cancelResponse = await fetch(`${httpBase}/v1/sessions/${session.id}/cancel`, {
      method: "POST",
    })
    expect(cancelResponse.status).toBe(202)
    const cancelBody = CancelSessionResponseSchema.parse(await cancelResponse.json())
    expect(cancelBody.turnId).toBe(promptBody.turnId)

    const events = await eventsPromise

    const turnCancelled = events.find((event) => event.type === "turn.cancelled")
    expect(turnCancelled).toBeDefined()
    if (turnCancelled?.type === "turn.cancelled") {
      expect(turnCancelled.payload.turnId).toBe(promptBody.turnId)
    }

    const stopping = events.find(
      (event) =>
        event.type === "session.state" && event.payload.state === "stopping",
    )
    expect(stopping).toBeDefined()

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

    const secondPromptResponse = await fetch(`${httpBase}/v1/sessions/${session.id}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "second prompt after cancel" }),
    })
    expect(secondPromptResponse.status).toBe(202)
    const secondPromptBody = PromptSessionResponseSchema.parse(
      await secondPromptResponse.json(),
    )
    expect(secondPromptBody.turnId).not.toBe(promptBody.turnId)

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

    database.close()
  })
})
