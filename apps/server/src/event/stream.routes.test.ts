import { afterEach, describe, expect, test } from "bun:test"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import {
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"
import { WebSocket } from "ws"
import { events } from "../persistence/schema/events"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  createWorkspaceDir,
  enableAgent,
  seedBoundSession,
  seedWorkspace,
} from "../test-support/create-test-app"
import { eventDataText } from "../test/event.data.text"
import { Config } from "../config/config"
import { eventCursorToString, MAX_SAFE_EVENT_CURSOR } from "./cursor"
import { createEventJournalRepository } from "./journal.repository"

const resources = createTestAppResources()

const websocketUpgradeHeaders = {
  connection: "upgrade",
  upgrade: "websocket",
  "sec-websocket-version": "13",
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
}

const serverStatusRecord = (occurredAt: string) => ({
  schemaVersion: 1 as const,
  kind: "server.status" as const,
  occurredAt,
  payload: { state: "online" as const },
})

const getListeningUrl = async (app: { listen: (opts: { host: string; port: number }) => Promise<string>; server: { address: () => unknown } }, config: Config) => {
  await app.listen({ host: config.host, port: 0 })
  const address = app.server.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected bound server address")
  }

  return `ws://${config.host}:${address.port}/v1/events`
}

const collectReplayFrames = (url: string, idleMs = 150): Promise<Event[][]> =>
  new Promise((resolve) => {
    const ws = new WebSocket(url)
    const frames: Event[][] = []
    let idleTimer: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer)
      }

      ws.close()
    }

    const resetIdleTimer = () => {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer)
      }

      idleTimer = setTimeout(() => {
        finish()
        resolve(frames)
      }, idleMs)
    }

    ws.addEventListener("open", () => {
      resetIdleTimer()
    })

    ws.addEventListener("message", (event) => {
      frames.push(EventFrameSchema.parse(JSON.parse(eventDataText(event.data))))
      resetIdleTimer()
    })

    ws.addEventListener("close", () => {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer)
      }

      resolve(frames)
    })
  })

const seedServerStatusEvents = (
  journal: ReturnType<typeof createEventJournalRepository>,
  count: number,
) => {
  const records = Array.from({ length: count }, (_, index) =>
    serverStatusRecord(`2026-07-24T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`),
  )

  for (const chunk of Array.from({ length: Math.ceil(count / 100) }, (_, chunkIndex) =>
    records.slice(chunkIndex * 100, chunkIndex * 100 + 100),
  )) {
    const appended = journal.append({ records: chunk })
    expect(appended.ok).toBe(true)
  }
}

const rejectHandshake = async (
  app: Awaited<ReturnType<typeof createTestApp>>["app"],
  config: Config,
  query: string,
) => {
  await app.listen({ host: config.host, port: 0 })
  const address = app.server.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected bound server address")
  }

  const response = await fetch(`http://${config.host}:${address.port}/v1/events${query}`, {
    headers: websocketUpgradeHeaders,
  })

  return {
    status: response.status,
    body: JSON.parse(await response.text()) as unknown,
  }
}

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("GET /v1/events websocket replay", () => {
  test("replays all public events from cursor 0", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, 3)

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(`${url}?cursor=0`)
    const replayed = frames.flat()

    expect(replayed).toHaveLength(4)
    expect(replayed.filter((event) => event.type === "server.status")).toHaveLength(4)

    await app.close()
  })

  test("sends replay in bounded frames of up to 500 events", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, 600)

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(`${url}?cursor=0`, 250)

    expect(frames).toHaveLength(2)
    expect(frames[0]).toHaveLength(500)
    expect(frames[1]).toHaveLength(101)

    await app.close()
  })

  test("replays only records above the requested cursor", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, 4)

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(`${url}?cursor=2`)

    expect(frames.flat().map((event) => event.cursor)).toEqual(["3", "4", "5"])
    await app.close()
  })

  test("upgrades without replay when cursor is missing", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, 2)

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(url)

    expect(frames).toEqual([])
    await app.close()
  })

  test("filters replay by workspace id", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    const otherWorkspaceDir = await createWorkspaceDir(dataDir, "other-project")
    const otherWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Other", path: otherWorkspaceDir },
    })
    const otherWorkspace = JSON.parse(otherWorkspaceResponse.body) as { id: string }

    journal.append({
      records: [
        {
          schemaVersion: 1,
          kind: "session.state",
          occurredAt: "2026-07-24T12:00:01.000Z",
          workspaceId,
          sessionId: "sess-a",
          payload: { state: "idle" },
        },
        {
          schemaVersion: 1,
          kind: "session.state",
          occurredAt: "2026-07-24T12:00:02.000Z",
          workspaceId: otherWorkspace.id,
          sessionId: "sess-b",
          payload: { state: "idle" },
        },
      ],
    })

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(`${url}?cursor=0&workspaceId=${workspaceId}`)

    expect(frames.flat().map((event) => event.workspaceId)).toEqual([workspaceId, workspaceId])
    await app.close()
  })

  test("filters replay by session id", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn = (binaryName: string) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, database, config, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      undefined,
      { capabilities: { loadSession: true, sessionClose: true, sessionList: true } },
    )
    const journal = createEventJournalRepository(database)
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const sessionA = await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Session A",
    })
    const sessionB = await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Session B",
    })

    journal.append({
      records: [
        {
          schemaVersion: 1,
          kind: "session.state",
          occurredAt: "2026-07-24T12:00:00.000Z",
          workspaceId,
          sessionId: sessionA.sessionId,
          payload: { state: "idle" },
        },
        {
          schemaVersion: 1,
          kind: "session.state",
          occurredAt: "2026-07-24T12:00:01.000Z",
          workspaceId,
          sessionId: sessionB.sessionId,
          payload: { state: "idle" },
        },
      ],
    })

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(`${url}?cursor=0&sessionId=${sessionB.sessionId}`)
    const replayed = frames.flat()

    expect(replayed.length).toBeGreaterThan(0)
    expect(replayed.every((event) => event.sessionId === sessionB.sessionId)).toBe(true)
    expect(replayed.some((event) => event.type === "session.created")).toBe(true)
    await app.close()
  })

  test("uses AND semantics for workspace and session filters", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn = (binaryName: string) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, database, config, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      undefined,
      { capabilities: { loadSession: true, sessionClose: true, sessionList: true } },
    )
    const journal = createEventJournalRepository(database)
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const seeded = await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Filtered",
    })

    journal.append({
      records: [
        {
          schemaVersion: 1,
          kind: "session.state",
          occurredAt: "2026-07-24T12:00:00.000Z",
          workspaceId: "ws-other",
          sessionId: seeded.sessionId,
          payload: { state: "idle" },
        },
      ],
    })

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(
      `${url}?cursor=0&workspaceId=${workspaceId}&sessionId=${seeded.sessionId}`,
    )

    expect(frames.flat().every((event) => event.sessionId === seeded.sessionId)).toBe(true)
    expect(frames.flat().every((event) => event.workspaceId === workspaceId)).toBe(true)
    await app.close()
  })

  test("replays mid-turn output.complete with earlier chunk context", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)
    const turnId = `turn_${ulid()}`

    journal.append({
      records: [
        {
          schemaVersion: 1,
          kind: "acp.notification",
          occurredAt: "2026-07-24T12:00:00.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-1",
          turnId,
          protocolVersion: 1,
          direction: "agent_to_agent_server",
          phase: "live",
          payload: { updateKind: "agent_message_chunk", text: "Hello" },
        },
        {
          schemaVersion: 1,
          kind: "acp.notification",
          occurredAt: "2026-07-24T12:00:01.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-1",
          turnId,
          protocolVersion: 1,
          direction: "agent_to_agent_server",
          phase: "live",
          payload: { updateKind: "agent_message_chunk", text: " world" },
        },
        {
          schemaVersion: 1,
          kind: "turn.completed",
          occurredAt: "2026-07-24T12:00:02.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-1",
          turnId,
          payload: {},
        },
      ],
    })

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(`${url}?cursor=2`)
    const replayed = frames.flat()

    expect(replayed.map((event) => event.type)).toEqual([
      "session.output.delta",
      "session.output.complete",
      "turn.completed",
    ])
    expect(
      replayed.find((event) => event.type === "session.output.complete")?.payload,
    ).toEqual({ turnId, text: "Hello world" })

    await app.close()
  })

  test("includes workspace deletion tombstones in replay", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}`,
    })
    expect(deleteResponse.statusCode).toBe(204)

    const records = journal.readAfter({ cursor: 0n, limit: 100 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    expect(records.value.some((record) => record.kind === "workspace.changed")).toBe(true)

    const url = await getListeningUrl(app, config)
    const frames = await collectReplayFrames(`${url}?cursor=0`)

    expect(frames.flat().some((event) => event.type === "workspace.changed")).toBe(true)
    await app.close()
  })
})

describe("GET /v1/events websocket handshake validation", () => {
  test("returns 400 for malformed cursor before upgrade", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)

    const response = await rejectHandshake(app, config, "?cursor=-1")
    const body = ValidationProblemSchema.parse(response.body)

    expect(response.status).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.query.cursor.invalid")
    await app.close()
  })

  test("returns 400 for unsafe cursor before upgrade", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const unsafeCursor = eventCursorToString(MAX_SAFE_EVENT_CURSOR + 1n)

    const response = await rejectHandshake(app, config, `?cursor=${unsafeCursor}`)
    const body = ValidationProblemSchema.parse(response.body)

    expect(response.status).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.query.cursor.unsafe")
    await app.close()
  })

  test("returns 400 for future cursor before upgrade", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, 1)

    const response = await rejectHandshake(app, config, "?cursor=99")
    const body = ValidationProblemSchema.parse(response.body)

    expect(response.status).toBe(400)
    expect(body.errors[0]?.code).toBe("validation.query.cursor.future")
    await app.close()
  })

  test("returns 404 for unknown workspace filter before upgrade", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)

    const response = await rejectHandshake(app, config, "?workspaceId=ws_missing")

    NotFoundProblemSchema.parse(response.body)
    expect(response.status).toBe(404)
    await app.close()
  })

  test("returns 404 for unknown session filter before upgrade", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)

    const response = await rejectHandshake(app, config, "?sessionId=sess_missing")

    NotFoundProblemSchema.parse(response.body)
    expect(response.status).toBe(404)
    await app.close()
  })

  test("returns 404 when session does not belong to workspace filter", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn = (binaryName: string) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, config, acpSupervisor, database } = await createTestApp(resources, dataDir, whichFn)
    const firstWorkspace = await seedWorkspace(app, dataDir)
    const secondWorkspaceDir = await createWorkspaceDir(dataDir, "second-project")
    const secondWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Second", path: secondWorkspaceDir },
    })
    const secondWorkspace = JSON.parse(secondWorkspaceResponse.body) as { id: string }
    await enableAgent(app, "cursor", whichFn)

    const seeded = await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId: firstWorkspace.workspaceId,
      workspacePath: firstWorkspace.workspaceDir,
      agentId: "cursor",
      name: "Mismatch test",
    })

    const response = await rejectHandshake(
      app,
      config,
      `?workspaceId=${secondWorkspace.id}&sessionId=${seeded.sessionId}`,
    )

    NotFoundProblemSchema.parse(response.body)
    expect(response.status).toBe(404)
    await app.close()
  })
})

describe("GET /v1/events journal corruption", () => {
  test("closes with 1011 after the last valid cursor and resumes after repair", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, 2)

    database.db
      .insert(events)
      .values({
        schemaVersion: 1,
        kind: "server.status",
        occurredAt: "2026-07-24T12:00:02.000Z",
        workspaceId: null,
        sessionId: null,
        sessionSequence: null,
        turnId: null,
        protocolVersion: null,
        direction: null,
        method: null,
        phase: null,
        payload: JSON.stringify({ state: "online", secret: "token" }),
      })
      .run()

    journal.append({
      records: [serverStatusRecord("2026-07-24T12:00:03.000Z")],
    })

    const url = await getListeningUrl(app, config)

    const corruptClose = await new Promise<{ code: number; reason: string; frames: Event[][] }>(
      (resolve) => {
        const ws = new WebSocket(`${url}?cursor=0`)
        const frames: Event[][] = []

        ws.addEventListener("message", (event) => {
          frames.push(EventFrameSchema.parse(JSON.parse(eventDataText(event.data))))
        })

        ws.addEventListener("close", (closeEvent) => {
          resolve({ code: closeEvent.code, reason: closeEvent.reason, frames })
        })
      },
    )

    expect(corruptClose.frames.flat().map((event) => event.cursor)).toEqual(["1", "2", "3"])
    expect(corruptClose.code).toBe(1011)
    expect(corruptClose.reason).toBe("journal corruption")

    database.db.delete(events).where(eq(events.cursor, 4)).run()

    const recoveredFrames = await collectReplayFrames(`${url}?cursor=3`, 150)
    expect(recoveredFrames.flat().map((event) => event.cursor)).toEqual(["5"])

    await app.close()
  })
})
