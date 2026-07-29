import { afterEach, describe, expect, test } from "bun:test"
import { EventSchema } from "contracts/events/event"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedWorkspace,
} from "../test-support/create-test-app"
import { createEventJournalRepository } from "./event-journal-repository"
import { parseLifecycleJournalRecord } from "./lifecycle.models"
import { projectLifecycleEvent } from "./lifecycle.projectors"
import { ParsedJournalRecord } from "./event-journal-repository"

describe("projectLifecycleEvent", () => {
  const baseRecord = {
    schemaVersion: 1,
    occurredAt: "2026-07-24T12:00:00.000Z",
    workspaceId: "ws_test",
    sessionId: "sess_test",
    sessionSequence: 1,
    turnId: null,
    protocolVersion: null,
    direction: null,
    method: null,
    phase: null,
  } satisfies Omit<ParsedJournalRecord, "cursor" | "kind" | "payload">

  test("maps workspace.created with state", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 5n,
      kind: "workspace.changed",
      workspaceId: "ws_abc",
      sessionId: null,
      payload: { change: "created", state: "available" },
    }

    const event = projectLifecycleEvent(parseLifecycleJournalRecord(record))
    expect(event).toEqual(
      EventSchema.parse({
        type: "workspace.changed",
        cursor: "5",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws_abc",
        payload: { workspaceId: "ws_abc", change: "created", state: "available" },
      }),
    )
  })

  test("maps workspace.deleted without state", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 9n,
      kind: "workspace.changed",
      workspaceId: "ws_abc",
      sessionId: null,
      payload: { change: "deleted" },
    }

    const event = projectLifecycleEvent(parseLifecycleJournalRecord(record))
    expect(event).toEqual(
      EventSchema.parse({
        type: "workspace.changed",
        cursor: "9",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws_abc",
        payload: { workspaceId: "ws_abc", change: "deleted" },
      }),
    )
  })

  test("maps session.created", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 3n,
      kind: "session.created",
      payload: { name: "Debug auth" },
    }

    const event = projectLifecycleEvent(parseLifecycleJournalRecord(record))
    expect(event).toEqual(
      EventSchema.parse({
        type: "session.created",
        cursor: "3",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws_test",
        sessionId: "sess_test",
        payload: {
          sessionId: "sess_test",
          workspaceId: "ws_test",
          name: "Debug auth",
        },
      }),
    )
  })

  test("maps session.state", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 4n,
      kind: "session.state",
      payload: { state: "idle" },
    }

    const event = projectLifecycleEvent(parseLifecycleJournalRecord(record))
    expect(event).toEqual(
      EventSchema.parse({
        type: "session.state",
        cursor: "4",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws_test",
        sessionId: "sess_test",
        payload: { sessionId: "sess_test", state: "idle" },
      }),
    )
  })

  test("maps server.status", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 1n,
      kind: "server.status",
      workspaceId: null,
      sessionId: null,
      sessionSequence: null,
      payload: { state: "online" },
    }

    const event = projectLifecycleEvent(parseLifecycleJournalRecord(record))
    expect(event).toEqual(
      EventSchema.parse({
        type: "server.status",
        cursor: "1",
        occurredAt: "2026-07-24T12:00:00.000Z",
        payload: { state: "online" },
      }),
    )
  })

  test("parseLifecycleJournalRecord rejects non-lifecycle kinds", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 2n,
      kind: "turn.started",
      turnId: "turn_test",
      payload: {},
    }

    expect(() => parseLifecycleJournalRecord(record)).toThrow()
  })
})

describe("lifecycle events integration", () => {
  const resources = createTestAppResources()

  afterEach(async () => {
    await cleanupTestAppResources(resources)
  })

  test("workspace create appends workspace.changed in the journal", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    const { workspaceId } = await seedWorkspace(app, dataDir)

    const records = journal.readAfter({ cursor: 0n, limit: 100 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    const workspaceEvents = records.value.filter((record) => record.kind === "workspace.changed")
    expect(workspaceEvents).toHaveLength(1)
    expect(workspaceEvents[0]!.workspaceId).toBe(workspaceId)
    expect(workspaceEvents[0]!.payload).toEqual({
      change: "created",
      state: "available",
    })
  })

  test("session create appends session.created and session.state records", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn = (binaryName: string) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, database } = await createTestApp(resources, dataDir, whichFn)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Lifecycle test" },
    })
    expect(response.statusCode).toBe(201)

    const records = journal.readAfter({ cursor: 0n, limit: 100 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    const sessionCreated = records.value.filter((record) => record.kind === "session.created")
    const sessionStates = records.value.filter((record) => record.kind === "session.state")

    expect(sessionCreated).toHaveLength(1)
    expect(sessionCreated[0]!.payload).toEqual({ name: "Lifecycle test" })

    expect(sessionStates.map((record) => (record.payload as { state: string }).state)).toEqual([
      "starting",
      "idle",
    ])
  })

  test("archive retains session journal history", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn = (binaryName: string) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, database } = await createTestApp(resources, dataDir, whichFn)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Archive me" },
    })
    const session = JSON.parse(createResponse.body) as { id: string }

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/archive`,
    })
    expect(archiveResponse.statusCode).toBe(200)

    const records = journal.readAfter({
      cursor: 0n,
      limit: 100,
      sessionId: session.id,
    })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    expect(records.value.map((record) => record.kind)).toEqual([
      "session.created",
      "session.state",
      "session.state",
      "session.state",
    ])
    expect(
      records.value
        .filter((record) => record.kind === "session.state")
        .map((record) => (record.payload as { state: string }).state),
    ).toEqual(["starting", "idle", "archived"])
  })

  test("workspace rename appends workspace.changed updated", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}`,
      payload: { name: "Renamed" },
    })
    expect(response.statusCode).toBe(200)

    const records = journal.readAfter({ cursor: 0n, limit: 100, workspaceId })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    const updated = records.value.filter(
      (record) =>
        record.kind === "workspace.changed" &&
        (record.payload as { change: string }).change === "updated",
    )
    expect(updated).toHaveLength(1)
    expect((updated[0]!.payload as { state: string }).state).toBe("available")
  })

  test("session error appends session.state error", async () => {
    const dataDir = await createTempDataDir(resources)
    const { openDatabase } = await import("../persistence/open-database")
    const { createSessionService } = await import("../session/service")
    const { createSessionRepository } = await import("../session/session-repository")
    const { createWorkspaceRepository } = await import("../workspace/workspace-repository")
    const { createEventCommitPublisher } = await import("./commit.publisher")
    const { mkdir } = await import("node:fs/promises")
    const path = await import("node:path")

    const database = openDatabase({ dataDir })
    const workspaceDir = path.join(dataDir, "project")
    await mkdir(workspaceDir)
    const workspaceRepository = createWorkspaceRepository(database)
    const workspace = workspaceRepository.create({ name: "Project", path: workspaceDir })
    expect(workspace.ok).toBe(true)
    if (!workspace.ok) {
      return
    }

    const eventJournal = createEventJournalRepository(database)
    const commitPublisher = createEventCommitPublisher()
    const sessionRepository = createSessionRepository(database)
    const sessionService = createSessionService({
      database,
      sessionRepository,
      eventJournal,
      commitPublisher,
    })

    const created = sessionService.createStarting({
      workspaceId: workspace.value.id,
      agentId: "cursor",
      name: "Fails",
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const errored = sessionService.markError({ id: created.value.id })
    expect(errored.ok).toBe(true)

    const records = eventJournal.readAfter({
      cursor: 0n,
      limit: 100,
      sessionId: created.value.id,
    })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    const states = records.value
      .filter((record) => record.kind === "session.state")
      .map((record) => (record.payload as { state: string }).state)

    expect(states).toEqual(["starting", "error"])
    database.close()
  })

  test("session resume appends session.state idle", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn = (binaryName: string) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, database } = await createTestApp(resources, dataDir, whichFn)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Resume me" },
    })
    const session = JSON.parse(createResponse.body) as { id: string }

    await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/resume`,
    })

    const records = journal.readAfter({
      cursor: 0n,
      limit: 100,
      sessionId: session.id,
    })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    const states = records.value
      .filter((record) => record.kind === "session.state")
      .map((record) => (record.payload as { state: string }).state)

    expect(states).toEqual(["starting", "idle", "idle"])
  })

  test("rollback publishes nothing when workspace delete target is missing", async () => {
    const dataDir = await createTempDataDir(resources)
    const { openDatabase } = await import("../persistence/open-database")
    const { createWorkspaceService } = await import("../workspace/service")
    const { createWorkspaceRepository } = await import("../workspace/workspace-repository")
    const { createEventCommitPublisher } = await import("./commit.publisher")

    const database = openDatabase({ dataDir })
    const eventJournal = createEventJournalRepository(database)
    const commitPublisher = createEventCommitPublisher()
    const workspaceService = createWorkspaceService({
      database,
      workspaceRepository: createWorkspaceRepository(database),
      eventJournal,
      commitPublisher,
    })

    const received: string[] = []
    commitPublisher.subscribe((events) => {
      events.forEach((event) => {
        received.push(event.type)
      })
    })

    const result = workspaceService.delete({ id: "ws_missing" })
    expect(result.ok).toBe(false)
    expect(eventJournal.getHighWaterCursor()).toBe(0n)
    expect(received).toHaveLength(0)
    database.close()
  })

  test("keeps monotonic cursors and per-session sequences when events interleave", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn = (binaryName: string) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, database } = await createTestApp(resources, dataDir, whichFn)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "First" },
    })
    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Second" },
    })

    const records = journal.readAfter({ cursor: 0n, limit: 100 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      return
    }

    const cursors = records.value.map((record) => record.cursor)
    expect(cursors).toEqual(cursors.toSorted((left, right) => Number(left - right)))

    const sequencesBySession = records.value.reduce<Record<string, number[]>>(
      (accumulator, record) => {
        if (record.sessionId === null || record.sessionSequence === null) {
          return accumulator
        }

        return {
          ...accumulator,
          [record.sessionId]: [
            ...(accumulator[record.sessionId] ?? []),
            record.sessionSequence,
          ],
        }
      },
      {},
    )

    Object.values(sequencesBySession).forEach((sequences) => {
      expect(sequences).toEqual([1, 2, 3])
    })
  })

  test("workspace delete purges history and leaves one deletion tombstone", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn = (binaryName: string) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, database } = await createTestApp(resources, dataDir, whichFn)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Gone" },
    })

    const beforeDelete = journal.readAfter({ cursor: 0n, limit: 100 })
    expect(beforeDelete.ok).toBe(true)
    if (!beforeDelete.ok) {
      return
    }
    expect(beforeDelete.value.length).toBeGreaterThan(1)

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}`,
    })
    expect(deleteResponse.statusCode).toBe(204)

    const afterDelete = journal.readAfter({ cursor: 0n, limit: 100, workspaceId })
    expect(afterDelete.ok).toBe(true)
    if (!afterDelete.ok) {
      return
    }

    expect(afterDelete.value).toHaveLength(1)
    expect(afterDelete.value[0]!.kind).toBe("workspace.changed")
    expect(afterDelete.value[0]!.workspaceId).toBe(workspaceId)
    expect(afterDelete.value[0]!.payload).toEqual({ change: "deleted" })
  })

  test("commit publisher receives projected events after workspace create", async () => {
    const dataDir = await createTempDataDir(resources)
    const { parseConfig } = await import("../config/config")
    const { createRuntime } = await import("../runtime/runtime")
    const { createServer } = await import("../bootstrap/create-server")
    const { openDatabase } = await import("../persistence/open-database")

    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { app, commitPublisher } = await createServer({ config, runtime, database })
    resources.apps.push(app)

    const received: string[] = []
    commitPublisher.subscribe((events) => {
      events.forEach((event) => {
        received.push(event.type)
      })
    })

    await seedWorkspace(app, dataDir)

    expect(received).toContain("workspace.changed")
    expect(received).not.toContain("server.status")
  })

  test("persists runtime starting on bootstrap and offline before database close", async () => {
    const dataDir = await createTempDataDir(resources)
    const { parseConfig } = await import("../config/config")
    const { createRuntime } = await import("../runtime/runtime")
    const { createServer } = await import("../bootstrap/create-server")
    const { openDatabase } = await import("../persistence/open-database")
    const { listen, registerShutdown } = await import("../bootstrap/shutdown")

    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { app, acpSupervisor, runtimeStatusService } = await createServer({
      config,
      runtime,
      database,
    })
    const journal = createEventJournalRepository(database)

    const startingRecords = journal.readAfter({ cursor: 0n, limit: 10 })
    expect(startingRecords.ok).toBe(true)
    if (!startingRecords.ok) {
      return
    }
    expect(
      startingRecords.value.filter(
        (record) =>
          record.kind === "server.status" &&
          (record.payload as { state: string }).state === "starting",
      ),
    ).toHaveLength(1)

    registerShutdown(app, database, acpSupervisor, runtimeStatusService, [])
    await listen(app, config, runtimeStatusService)

    const onlineRecords = journal.readAfter({ cursor: 0n, limit: 10 })
    expect(onlineRecords.ok).toBe(true)
    if (!onlineRecords.ok) {
      return
    }
    expect(
      onlineRecords.value.some(
        (record) =>
          record.kind === "server.status" &&
          (record.payload as { state: string }).state === "online",
      ),
    ).toBe(true)

    runtimeStatusService.persistShuttingDown()
    await acpSupervisor.stop()
    await app.close()
    runtimeStatusService.persistOffline()

    const finalRecords = journal.readAfter({ cursor: 0n, limit: 20 })
    expect(finalRecords.ok).toBe(true)
    if (!finalRecords.ok) {
      return
    }

    const statuses = finalRecords.value
      .filter((record) => record.kind === "server.status")
      .map((record) => (record.payload as { state: string }).state)

    expect(statuses).toEqual(["starting", "online", "shutting_down", "offline"])

    database.close()
  })
})
