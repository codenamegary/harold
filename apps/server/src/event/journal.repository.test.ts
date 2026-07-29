import { afterEach, describe, expect, test } from "bun:test"
import { ulid } from "ulid"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "../persistence/database"
import { events } from "../persistence/schema/events"
import { eventCursorToString } from "./cursor"
import { createEventJournalRepository } from "./journal.repository"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-event-journal-"))
  tempDirs.push(dir)
  return dir
}

const serverStatusRecord = (occurredAt: string) => ({
  schemaVersion: 1 as const,
  kind: "server.status" as const,
  occurredAt,
  payload: { state: "online" as const },
})

const sessionStateRecord = (params: {
  occurredAt: string
  workspaceId: string
  sessionId: string
  state: "idle" | "running"
}) => ({
  schemaVersion: 1 as const,
  kind: "session.state" as const,
  occurredAt: params.occurredAt,
  workspaceId: params.workspaceId,
  sessionId: params.sessionId,
  payload: { state: params.state },
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("event journal repository", () => {
  test("appends records with monotonic global cursors", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    const first = repository.append({
      records: [serverStatusRecord("2026-07-24T12:00:00.000Z")],
    })
    const second = repository.append({
      records: [serverStatusRecord("2026-07-24T12:00:01.000Z")],
    })

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) {
      return
    }

    expect(first.value[0].cursor).toBe(1n)
    expect(second.value[0].cursor).toBe(2n)
    expect(second.value[0].cursor > first.value[0].cursor).toBe(true)
    expect(eventCursorToString(second.value[0].cursor)).toBe("2")

    database.close()
  })

  test("allocates per-session sequences under interleaved session writes", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    const appended = repository.append({
      records: [
        sessionStateRecord({
          occurredAt: "2026-07-24T12:00:00.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-a",
          state: "idle",
        }),
        sessionStateRecord({
          occurredAt: "2026-07-24T12:00:01.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-b",
          state: "idle",
        }),
        sessionStateRecord({
          occurredAt: "2026-07-24T12:00:02.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-a",
          state: "running",
        }),
      ],
    })

    expect(appended.ok).toBe(true)
    if (!appended.ok) {
      return
    }

    expect(appended.value.map((record) => record.sessionSequence)).toEqual([1, 1, 2])

    database.close()
  })

  test("increments session sequence after existing rows", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    database.db
      .insert(events)
      .values({
        schemaVersion: 1,
        kind: "session.state",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws-1",
        sessionId: "sess-a",
        sessionSequence: 1,
        turnId: null,
        protocolVersion: null,
        direction: null,
        method: null,
        phase: null,
        payload: JSON.stringify({ state: "idle" }),
      })
      .run()

    const appended = repository.append({
      records: [
        sessionStateRecord({
          occurredAt: "2026-07-24T12:00:01.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-a",
          state: "running",
        }),
      ],
    })

    expect(appended.ok).toBe(true)
    if (!appended.ok) {
      return
    }

    expect(appended.value[0].sessionSequence).toBe(2)

    database.close()
  })

  test("returns duplicate_session_sequence when sqlite unique constraint fails", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    const first = repository.append({
      records: [
        sessionStateRecord({
          occurredAt: "2026-07-24T12:00:00.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-a",
          state: "idle",
        }),
      ],
    })
    expect(first.ok).toBe(true)

    expect(() =>
      database.db.insert(events).values({
        schemaVersion: 1,
        kind: "session.state",
        occurredAt: "2026-07-24T12:00:01.000Z",
        workspaceId: "ws-1",
        sessionId: "sess-a",
        sessionSequence: 1,
        turnId: null,
        protocolVersion: null,
        direction: null,
        method: null,
        phase: null,
        payload: JSON.stringify({ state: "running" }),
      }).run(),
    ).toThrow()

    database.close()
  })

  test("rolls back appended records when the caller transaction aborts", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    expect(() =>
      database.db.transaction((executor) => {
        const appended = repository.append({
          records: [serverStatusRecord("2026-07-24T12:00:00.000Z")],
          executor,
        })
        expect(appended.ok).toBe(true)
        throw new Error("rollback")
      }),
    ).toThrow("rollback")

    expect(repository.getHighWaterCursor()).toBe(0n)

    database.close()
  })

  test("reads bounded records in cursor order with optional scope filters", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    repository.append({
      records: [
        serverStatusRecord("2026-07-24T12:00:00.000Z"),
        sessionStateRecord({
          occurredAt: "2026-07-24T12:00:01.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-a",
          state: "idle",
        }),
        sessionStateRecord({
          occurredAt: "2026-07-24T12:00:02.000Z",
          workspaceId: "ws-2",
          sessionId: "sess-b",
          state: "idle",
        }),
      ],
    })

    const all = repository.readAfter({ cursor: 0n, limit: 10 })
    const workspaceScoped = repository.readAfter({
      cursor: 0n,
      limit: 10,
      workspaceId: "ws-1",
    })
    const sessionScoped = repository.readAfter({
      cursor: 0n,
      limit: 10,
      sessionId: "sess-b",
    })

    expect(all.ok && workspaceScoped.ok && sessionScoped.ok).toBe(true)
    if (!all.ok || !workspaceScoped.ok || !sessionScoped.ok) {
      return
    }

    expect(all.value.map((record) => record.cursor)).toEqual([1n, 2n, 3n])
    expect(workspaceScoped.value.map((record) => record.sessionId)).toEqual(["sess-a"])
    expect(sessionScoped.value.map((record) => record.sessionId)).toEqual(["sess-b"])

    database.close()
  })

  test("filters reads by turn id", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)
    const firstTurnId = `turn_${ulid()}`
    const secondTurnId = `turn_${ulid()}`

    const appended = repository.append({
      records: [
        {
          schemaVersion: 1,
          kind: "turn.started",
          occurredAt: "2026-07-24T12:00:00.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-a",
          turnId: firstTurnId,
          payload: {},
        },
        {
          schemaVersion: 1,
          kind: "turn.started",
          occurredAt: "2026-07-24T12:00:01.000Z",
          workspaceId: "ws-1",
          sessionId: "sess-a",
          turnId: secondTurnId,
          payload: {},
        },
      ],
    })

    expect(appended.ok).toBe(true)

    const read = repository.readAfter({
      cursor: 0n,
      limit: 10,
      turnId: firstTurnId,
    })

    expect(read.ok).toBe(true)
    if (!read.ok) {
      return
    }

    expect(read.value).toHaveLength(1)
    expect(read.value[0].turnId).toBe(firstTurnId)

    database.close()
  })

  test("returns the committed high-water cursor", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    expect(repository.getHighWaterCursor()).toBe(0n)

    repository.append({
      records: [
        serverStatusRecord("2026-07-24T12:00:00.000Z"),
        serverStatusRecord("2026-07-24T12:00:01.000Z"),
      ],
    })

    expect(repository.getHighWaterCursor()).toBe(2n)

    database.close()
  })

  test("serializes bigint cursors as decimal strings", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    const largeCursor = 9007199254740991n
    database.db
      .insert(events)
      .values({
        cursor: Number(largeCursor),
        schemaVersion: 1,
        kind: "server.status",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: null,
        sessionId: null,
        sessionSequence: null,
        turnId: null,
        protocolVersion: null,
        direction: null,
        method: null,
        phase: null,
        payload: JSON.stringify({ state: "online" }),
      })
      .run()

    const read = repository.readAfter({ cursor: largeCursor - 1n, limit: 1 })
    expect(read.ok).toBe(true)
    if (!read.ok) {
      return
    }

    expect(read.value[0].cursor).toBe(largeCursor)
    expect(eventCursorToString(read.value[0].cursor)).toBe("9007199254740991")

    database.close()
  })

  test("returns corruption metadata without payload content for invalid stored payloads", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    database.db
      .insert(events)
      .values({
        schemaVersion: 1,
        kind: "server.status",
        occurredAt: "2026-07-24T12:00:00.000Z",
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

    const row = database.db.select().from(events).get()!
    const parsed = repository.parseRow(row)

    expect(parsed).toEqual({
      ok: false,
      error: {
        kind: "corruption",
        cursor: 1n,
        recordKind: "server.status",
        schemaVersion: 1,
      },
    })
    expect("payload" in (parsed.ok ? {} : parsed.error)).toBe(false)

    const read = repository.readAfter({ cursor: 0n, limit: 10 })
    expect(read).toEqual({
      ok: false,
      error: {
        kind: "corruption",
        cursor: 1n,
        recordKind: "server.status",
        schemaVersion: 1,
      },
    })

    database.close()
  })

  test("rejects unknown payload fields before persistence", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    const result = repository.append({
      records: [
        {
          schemaVersion: 1,
          kind: "server.status",
          occurredAt: "2026-07-24T12:00:00.000Z",
          payload: { state: "online", secret: "token" },
        },
      ],
    })

    expect(result).toEqual({ ok: false, error: { kind: "invalid_payload" } })
    expect(repository.getHighWaterCursor()).toBe(0n)

    database.close()
  })

  test("uses caller-owned executor without opening nested transactions", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })
    const repository = createEventJournalRepository(database)

    const committed = database.db.transaction((executor) =>
      repository.append({
        records: [serverStatusRecord("2026-07-24T12:00:00.000Z")],
        executor,
      }),
    )

    expect(committed.ok).toBe(true)
    expect(repository.getHighWaterCursor()).toBe(1n)
    expect(database.db.select({ count: events.cursor }).from(events).all()).toHaveLength(1)

    database.close()
  })
})
