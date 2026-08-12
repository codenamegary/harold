import { afterEach, describe, expect, test } from "bun:test"
import { ConflictProblemSchema } from "contracts/http/error"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import {
  CancelSessionResponseSchema,
  PromptSessionResponseSchema,
  SessionSchema,
} from "contracts/http/session"
import { WebSocket } from "ws"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { createEventJournalRepository } from "../event/journal.repository"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedBoundSession,
  seedWorkspace,
} from "../test-support/create-test-app"
import { eventDataText } from "../test/event.data.text"
import { Config } from "../config/config"

const resources = createTestAppResources()

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

const multiSessionFakeAcp = {
  capabilities: { loadSession: true, sessionClose: true, sessionList: true },
  emitSessionUpdatesOnPrompt: true,
  promptCompletionDelayMs: 400,
} as const

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

const waitForIdle = async (
  app: { inject: (opts: { method: string; url: string }) => Promise<{ body: string }> },
  sessionId: string,
) => {
  await waitFor(async () => {
    const latest = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionId}`,
    })
    return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
  })
}

const createIdleSession = async (params: {
  app: {
    inject: (opts: {
      method: string
      url: string
      payload?: Record<string, string>
    }) => Promise<{ body: string; statusCode: number }>
  }
  database: Parameters<typeof seedBoundSession>[0]["database"]
  acpSupervisor: Parameters<typeof seedBoundSession>[0]["acpSupervisor"]
  workspaceId: string
  workspaceDir: string
  name: string
}) => {
  const seeded = await seedBoundSession({
    database: params.database,
    acpSupervisor: params.acpSupervisor,
    workspaceId: params.workspaceId,
    workspacePath: params.workspaceDir,
    agentId: "cursor",
    name: params.name,
  })
  return { id: seeded.sessionId }
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
    const timeoutMs = params.timeoutMs ?? 8000
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

const hasTurnCompleted = (events: Event[], turnId: string) =>
  events.some(
    (event) => event.type === "turn.completed" && event.payload.turnId === turnId,
  )

const hasTurnCancelled = (events: Event[], turnId: string) =>
  events.some(
    (event) => event.type === "turn.cancelled" && event.payload.turnId === turnId,
  )

describe("concurrent session routing isolation", () => {
  test("session A slow prompt keeps running after select B and prompt B", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, acpSupervisor, config } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      undefined,
      multiSessionFakeAcp,
    )

    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const sessionA = await createIdleSession({
      app,
      database,
      acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Session A seed",
    })
    const sessionB = await createIdleSession({
      app,
      database,
      acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Session B seed",
    })
    expect(sessionA.id).not.toBe(sessionB.id)

    const { httpBase, wsUrl } = await getListeningUrl(app, config)
    const eventsA = collectEventsUntil({
      url: `${wsUrl}?sessionId=${sessionA.id}`,
      until: (events) =>
        events.some((event) => event.type === "turn.completed")
        && events.some(
          (event) =>
            event.type === "session.state"
            && event.payload.state === "idle"
            && event.sessionId === sessionA.id,
        ),
    })
    const eventsB = collectEventsUntil({
      url: `${wsUrl}?sessionId=${sessionB.id}`,
      until: (events) =>
        events.some((event) => event.type === "turn.completed")
        && events.some(
          (event) =>
            event.type === "session.state"
            && event.payload.state === "idle"
            && event.sessionId === sessionB.id,
        ),
    })

    await Promise.all([eventsA.whenOpen, eventsB.whenOpen])

    const promptAResponse = await fetch(`${httpBase}/v1/sessions/${sessionA.id}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "prompt-a-slow" }),
    })
    expect(promptAResponse.status).toBe(202)
    const promptA = PromptSessionResponseSchema.parse(await promptAResponse.json())

    const runningA = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionA.id}`,
    })
    expect(SessionSchema.parse(JSON.parse(runningA.body)).state).toBe("running")

    const selectB = await fetch(`${httpBase}/v1/sessions/${sessionB.id}/select`, {
      method: "POST",
    })
    expect(selectB.status).toBe(200)

    const stillRunningA = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionA.id}`,
    })
    expect(SessionSchema.parse(JSON.parse(stillRunningA.body)).state).toBe("running")

    const promptBResponse = await fetch(`${httpBase}/v1/sessions/${sessionB.id}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "prompt-b" }),
    })
    expect(promptBResponse.status).toBe(202)
    const promptB = PromptSessionResponseSchema.parse(await promptBResponse.json())
    expect(promptB.turnId).not.toBe(promptA.turnId)

    const overlappingA = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionA.id}`,
    })
    expect(SessionSchema.parse(JSON.parse(overlappingA.body)).state).toBe("running")

    const [collectedA, collectedB] = await Promise.all([
      eventsA.eventsPromise,
      eventsB.eventsPromise,
    ])

    expect(hasTurnCompleted(collectedA, promptA.turnId)).toBe(true)
    expect(hasTurnCompleted(collectedB, promptB.turnId)).toBe(true)
    expect(hasTurnCancelled(collectedA, promptA.turnId)).toBe(false)

    expect(
      collectedA.every((event) => event.sessionId === sessionA.id),
    ).toBe(true)
    expect(
      collectedB.every((event) => event.sessionId === sessionB.id),
    ).toBe(true)

    const turnStartedA = collectedA.find((event) => event.type === "turn.started")
    expect(turnStartedA?.type).toBe("turn.started")
    if (turnStartedA?.type === "turn.started") {
      expect(turnStartedA.payload.text).toBe("prompt-a-slow")
      expect(turnStartedA.payload.turnId).toBe(promptA.turnId)
    }

    const turnStartedB = collectedB.find((event) => event.type === "turn.started")
    expect(turnStartedB?.type).toBe("turn.started")
    if (turnStartedB?.type === "turn.started") {
      expect(turnStartedB.payload.text).toBe("prompt-b")
      expect(turnStartedB.payload.turnId).toBe(promptB.turnId)
    }

    const journal = createEventJournalRepository(database)
    const journalA = journal.readAfter({ cursor: 0n, limit: 200, sessionId: sessionA.id })
    const journalB = journal.readAfter({ cursor: 0n, limit: 200, sessionId: sessionB.id })
    expect(journalA.ok).toBe(true)
    expect(journalB.ok).toBe(true)
    if (!journalA.ok || !journalB.ok) {
      throw new Error("expected journal reads to succeed")
    }

    expect(journalA.value.every((record) => record.sessionId === sessionA.id)).toBe(true)
    expect(journalB.value.every((record) => record.sessionId === sessionB.id)).toBe(true)

    const turnStartedRecordA = journalA.value.find(
      (record) => record.kind === "turn.started" && record.turnId === promptA.turnId,
    )
    expect(turnStartedRecordA?.payload).toEqual({ text: "prompt-a-slow" })

    const turnStartedRecordB = journalB.value.find(
      (record) => record.kind === "turn.started" && record.turnId === promptB.turnId,
    )
    expect(turnStartedRecordB?.payload).toEqual({ text: "prompt-b" })

    expect(journalA.value.some((record) => record.turnId === promptB.turnId)).toBe(false)
    expect(journalB.value.some((record) => record.turnId === promptA.turnId)).toBe(false)
    expect(
      journalA.value.some(
        (record) => record.kind === "turn.cancelled" && record.turnId === promptA.turnId,
      ),
    ).toBe(false)
    expect(
      journalB.value.some(
        (record) => record.kind === "turn.cancelled" && record.turnId === promptB.turnId,
      ),
    ).toBe(false)

    await waitForIdle(app, sessionA.id)
    await waitForIdle(app, sessionB.id)

    database.close()
  })

  test("cancel on one session does not cancel the other", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, acpSupervisor, config } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      undefined,
      multiSessionFakeAcp,
    )

    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const sessionA = await createIdleSession({
      app,
      database,
      acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Cancel A seed",
    })
    const sessionB = await createIdleSession({
      app,
      database,
      acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Cancel B seed",
    })

    const { httpBase, wsUrl } = await getListeningUrl(app, config)
    const eventsA = collectEventsUntil({
      url: `${wsUrl}?sessionId=${sessionA.id}`,
      until: (events) => events.some((event) => event.type === "turn.cancelled"),
    })
    const eventsB = collectEventsUntil({
      url: `${wsUrl}?sessionId=${sessionB.id}`,
      until: (events) => events.some((event) => event.type === "turn.completed"),
    })

    await Promise.all([eventsA.whenOpen, eventsB.whenOpen])

    const promptAResponse = await fetch(`${httpBase}/v1/sessions/${sessionA.id}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "cancel-a" }),
    })
    expect(promptAResponse.status).toBe(202)
    const promptA = PromptSessionResponseSchema.parse(await promptAResponse.json())

    const promptBResponse = await fetch(`${httpBase}/v1/sessions/${sessionB.id}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "keep-b" }),
    })
    expect(promptBResponse.status).toBe(202)
    const promptB = PromptSessionResponseSchema.parse(await promptBResponse.json())

    const cancelA = await fetch(`${httpBase}/v1/sessions/${sessionA.id}/cancel`, {
      method: "POST",
    })
    expect(cancelA.status).toBe(202)
    const cancelBody = CancelSessionResponseSchema.parse(await cancelA.json())
    expect(cancelBody.turnId).toBe(promptA.turnId)

    const [collectedA, collectedB] = await Promise.all([
      eventsA.eventsPromise,
      eventsB.eventsPromise,
    ])

    expect(hasTurnCancelled(collectedA, promptA.turnId)).toBe(true)
    expect(hasTurnCompleted(collectedB, promptB.turnId)).toBe(true)
    expect(hasTurnCancelled(collectedB, promptB.turnId)).toBe(false)
    expect(hasTurnCompleted(collectedA, promptA.turnId)).toBe(false)
    expect(collectedA.every((event) => event.sessionId === sessionA.id)).toBe(true)
    expect(collectedB.every((event) => event.sessionId === sessionB.id)).toBe(true)
    expect(collectedA.some((event) => event.type === "turn.cancelled" && event.payload.turnId === promptB.turnId)).toBe(false)
    expect(collectedB.some((event) => event.type === "turn.cancelled")).toBe(false)

    await waitForIdle(app, sessionA.id)
    await waitForIdle(app, sessionB.id)

    const journal = createEventJournalRepository(database)
    const journalA = journal.readAfter({ cursor: 0n, limit: 200, sessionId: sessionA.id })
    const journalB = journal.readAfter({ cursor: 0n, limit: 200, sessionId: sessionB.id })
    expect(journalA.ok).toBe(true)
    expect(journalB.ok).toBe(true)
    if (!journalA.ok || !journalB.ok) {
      throw new Error("expected journal reads to succeed")
    }

    expect(
      journalA.value.some(
        (record) => record.kind === "turn.cancelled" && record.turnId === promptA.turnId,
      ),
    ).toBe(true)
    expect(journalA.value.some((record) => record.turnId === promptB.turnId)).toBe(false)
    expect(journalB.value.some((record) => record.kind === "turn.cancelled")).toBe(false)
    expect(
      journalB.value.some(
        (record) => record.kind === "turn.completed" && record.turnId === promptB.turnId,
      ),
    ).toBe(true)

    database.close()
  })

  test("same-session concurrent double prompt returns 409", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      undefined,
      multiSessionFakeAcp,
    )

    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const session = await createIdleSession({
      app,
      database,
      acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Double prompt seed",
    })

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/sessions/${session.id}/prompt`,
        payload: { text: "first concurrent" },
      }),
      app.inject({
        method: "POST",
        url: `/v1/sessions/${session.id}/prompt`,
        payload: { text: "second concurrent" },
      }),
    ])

    const statuses = [first.statusCode, second.statusCode].toSorted((left, right) => left - right)
    expect(statuses).toEqual([202, 409])

    const conflict = first.statusCode === 409 ? first : second
    const accepted = first.statusCode === 202 ? first : second
    const conflictBody = ConflictProblemSchema.parse(JSON.parse(conflict.body))
    expect(conflictBody.title).toBe("Turn already in progress")
    PromptSessionResponseSchema.parse(JSON.parse(accepted.body))

    await waitForIdle(app, session.id)

    database.close()
  })

  test("select has no execution side effect on other running session", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      undefined,
      multiSessionFakeAcp,
    )

    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const sessionA = await createIdleSession({
      app,
      database,
      acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Select side A",
    })
    const sessionB = await createIdleSession({
      app,
      database,
      acpSupervisor,
      workspaceId,
      workspaceDir,
      name: "Select side B",
    })

    const promptA = await app.inject({
      method: "POST",
      url: `/v1/sessions/${sessionA.id}/prompt`,
      payload: { text: "running-a" },
    })
    expect(promptA.statusCode).toBe(202)
    const turnA = PromptSessionResponseSchema.parse(JSON.parse(promptA.body))

    const beforeSelect = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionA.id}`,
    })
    expect(SessionSchema.parse(JSON.parse(beforeSelect.body)).state).toBe("running")

    const selectB = await app.inject({
      method: "POST",
      url: `/v1/sessions/${sessionB.id}/select`,
    })
    expect(selectB.statusCode).toBe(200)

    const afterSelect = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionA.id}`,
    })
    expect(SessionSchema.parse(JSON.parse(afterSelect.body)).state).toBe("running")

    await waitForIdle(app, sessionA.id)

    const journal = createEventJournalRepository(database)
    const journalA = journal.readAfter({ cursor: 0n, limit: 200, sessionId: sessionA.id })
    expect(journalA.ok).toBe(true)
    if (!journalA.ok) {
      throw new Error("expected journal A read to succeed")
    }
    expect(
      journalA.value.some(
        (record) => record.kind === "turn.completed" && record.turnId === turnA.turnId,
      ),
    ).toBe(true)
    expect(journalA.value.some((record) => record.kind === "turn.cancelled")).toBe(false)

    database.close()
  })
})
