import { afterEach, describe, expect, test } from "bun:test"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import {
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
import { eventDataText } from "../test/event.data.text"
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
      const frame = EventFrameSchema.parse(JSON.parse(eventDataText(event.data)))
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

describe("HTTP prompt accept-and-stream", () => {
  test("POST prompt returns 202 and streams turn.started text, output deltas, then idle", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      undefined,
      {
        capabilities: { loadSession: true, sessionClose: true },
        sessionNewSessionId: "fake-session-prompt-http",
        sessionLoadSessionId: "fake-session-prompt-http",
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
        text: "Prompt stream",
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
        events.some((event) => event.type === "turn.completed") &&
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
      body: JSON.stringify({ text: "operator prompt text" }),
    })

    expect(promptResponse.status).toBe(202)
    const promptBody = PromptSessionResponseSchema.parse(await promptResponse.json())
    expect(promptBody.turnId).toMatch(/^turn_[0-9A-HJKMNP-TV-Z]{26}$/)

    const running = await app.inject({
      method: "GET",
      url: `/v1/sessions/${session.id}`,
    })
    expect(SessionSchema.parse(JSON.parse(running.body)).state).toBe("running")

    const events = await eventsPromise

    const turnStarted = events.find((event) => event.type === "turn.started")
    expect(turnStarted).toBeDefined()
    if (turnStarted?.type === "turn.started") {
      expect(turnStarted.payload.text).toBe("operator prompt text")
      expect(turnStarted.payload.turnId).toBe(promptBody.turnId)
    }

    const outputDeltas = events.filter((event) => event.type === "session.output.delta")
    expect(outputDeltas.length).toBeGreaterThan(0)

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

    const idle = await app.inject({
      method: "GET",
      url: `/v1/sessions/${session.id}`,
    })
    expect(SessionSchema.parse(JSON.parse(idle.body)).state).toBe("idle")

    database.close()
  })
})
