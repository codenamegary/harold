import { afterEach, describe, expect, test } from "bun:test"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import {
  PermissionRequestCollectionSchema,
  ResolvePermissionRequestResponseSchema,
} from "contracts/http/permission"
import {
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

const createPermissionSession = async (dataDir: string) => {
  const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
    capabilities: { loadSession: true, sessionClose: true },
    sessionNewSessionId: "fake-session-permission-http",
    sessionLoadSessionId: "fake-session-permission-http",
    emitPermissionRequestOnPrompt: true,
  })

  const { workspaceId } = await seedWorkspace(app, dataDir)
  await enableAgent(app, "cursor", whichFn)

  const created = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    payload: {
      workspaceId,
      agentId: "cursor",
      text: "Permission prompt",
    },
  })
  const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))

  await waitFor(async () => {
    const pendingResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${session.id}/permissions?status=pending`,
    })
    if (pendingResponse.statusCode !== 200) {
      return false
    }

    const pendingBody = PermissionRequestCollectionSchema.parse(JSON.parse(pendingResponse.body))
    return pendingBody.items.length === 1
  })

  const pending = PermissionRequestCollectionSchema.parse(
    JSON.parse(
      (
        await app.inject({
          method: "GET",
          url: `/v1/sessions/${session.id}/permissions?status=pending`,
        })
      ).body,
    ),
  )

  const request = pending.items[0]
  if (request === undefined) {
    throw new Error("expected pending permission")
  }

  return { app, config, session, request, workspaceId }
}

describe("HTTP permission decisions", () => {
  test("PATCH permission resolves pending ACP work and streams resolution", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "fake-session-permission-http",
      sessionLoadSessionId: "fake-session-permission-http",
      emitPermissionRequestOnPrompt: true,
    })

    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        text: "Permission prompt",
      },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))
    expect(session.state).toBe("running")

    await waitFor(async () => {
      const pendingResponse = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}/permissions?status=pending`,
      })
      if (pendingResponse.statusCode !== 200) {
        return false
      }

      const pendingBody = PermissionRequestCollectionSchema.parse(JSON.parse(pendingResponse.body))
      return pendingBody.items.length === 1
    })

    const pendingDuringCreate = PermissionRequestCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: `/v1/sessions/${session.id}/permissions?status=pending`,
          })
        ).body,
      ),
    )
    expect(pendingDuringCreate.items.length).toBe(1)

    const firstRequest = pendingDuringCreate.items[0]
    if (firstRequest === undefined) {
      throw new Error("expected pending permission during session create")
    }

    await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${session.id}/permissions/${firstRequest.id}`,
      payload: { status: "resolved", optionId: "allow-once" },
    })

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

    const { wsUrl } = await getListeningUrl(app, config)
    const { eventsPromise, whenOpen } = collectEventsUntil({
      url: `${wsUrl}?sessionId=${session.id}`,
      until: (events) =>
        events.some((event) => event.type === "session.permission.requested"),
      timeoutMs: 10000,
    })

    await whenOpen
    await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/prompt`,
      payload: { text: "Need permission" },
    })

    const events = await eventsPromise
    const requested = events.find((event) => event.type === "session.permission.requested")
    expect(requested?.type).toBe("session.permission.requested")
    if (requested?.type !== "session.permission.requested") {
      throw new Error("expected permission request event")
    }

    const pending = await app.inject({
      method: "GET",
      url: `/v1/sessions/${session.id}/permissions?status=pending`,
    })
    const pendingBody = PermissionRequestCollectionSchema.parse(JSON.parse(pending.body))
    expect(pendingBody.items.length).toBe(1)
    expect(pendingBody.items[0]?.id).toBe(requested.payload.requestId)

    const resolved = await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${session.id}/permissions/${requested.payload.requestId}`,
      payload: { status: "resolved", optionId: "allow-once" },
    })
    const resolvedBody = ResolvePermissionRequestResponseSchema.parse(JSON.parse(resolved.body))
    expect(resolvedBody.status).toBe("resolved")

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

    const emptyPending = PermissionRequestCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: `/v1/sessions/${session.id}/permissions?status=pending`,
          })
        ).body,
      ),
    )
    expect(emptyPending.items).toEqual([])
  })

  test("PATCH reject-once resolves with deny option", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, session, request } = await createPermissionSession(dataDir)

    const resolved = await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${session.id}/permissions/${request.id}`,
      payload: { status: "resolved", optionId: "reject-once" },
    })
    const resolvedBody = ResolvePermissionRequestResponseSchema.parse(JSON.parse(resolved.body))
    expect(resolvedBody.status).toBe("resolved")
  })

  test("PATCH returns validation and conflict problems", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, session, request } = await createPermissionSession(dataDir)

    const unknown = await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${session.id}/permissions/${request.id}`,
      payload: { status: "resolved", optionId: "missing" },
    })
    expect(unknown.statusCode).toBe(400)

    const allow = await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${session.id}/permissions/${request.id}`,
      payload: { status: "resolved", optionId: "allow-once" },
    })
    expect(allow.statusCode).toBe(200)

    const duplicate = await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${session.id}/permissions/${request.id}`,
      payload: { status: "resolved", optionId: "allow-once" },
    })
    expect(duplicate.statusCode).toBe(409)
  })

  test("PATCH returns conflict when request belongs to another session", async () => {
    const dataDir = await createTempDataDir(resources)
    const first = await createPermissionSession(dataDir)

    const secondCreated = await first.app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId: first.workspaceId,
        agentId: "cursor",
        text: "Second session",
      },
    })
    const secondSession = CreateSessionResponseSchema.parse(JSON.parse(secondCreated.body))

    const wrongSession = await first.app.inject({
      method: "PATCH",
      url: `/v1/sessions/${secondSession.id}/permissions/${first.request.id}`,
      payload: { status: "resolved", optionId: "allow-once" },
    })
    expect(wrongSession.statusCode).toBe(409)
  })

  test("restart clears in-memory pending registry", async () => {
    const dataDir = await createTempDataDir(resources)
    const first = await createPermissionSession(dataDir)

    await Promise.all(resources.takeApps().map((app) => app.close()))
    resources.takeApps()
    resources.takeFakeProcesses().forEach((process) => process.kill())
    resources.takeFakeProcesses()

    const restarted = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "fake-session-permission-http",
      sessionLoadSessionId: "fake-session-permission-http",
      emitPermissionRequestOnPrompt: true,
    })

    const pending = await restarted.app.inject({
      method: "GET",
      url: `/v1/sessions/${first.session.id}/permissions?status=pending`,
    })
    expect(pending.statusCode).toBe(200)
    const pendingBody = PermissionRequestCollectionSchema.parse(JSON.parse(pending.body))
    expect(pendingBody.items).toEqual([])
  })
})
