import { afterEach, describe, expect, test } from "bun:test"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import { WebSocket } from "ws"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  createWorkspaceDir,
  seedWorkspace,
} from "../test-support/create-test-app"
import { eventDataText } from "../test/event.data.text"
import { Config } from "../config/config"
import { EventCommitPublisher } from "./commit.publisher"
import {
  createEventJournalRepository,
  EventJournalRepository,
} from "./journal.repository"
import { JournalAppendRecord } from "contracts/events/journal-record"

const resources = createTestAppResources()

const serverStatusRecord = (occurredAt: string) => ({
  schemaVersion: 1 as const,
  kind: "server.status" as const,
  occurredAt,
  payload: { state: "online" as const },
})

const getListeningUrl = async (
  app: { listen: (opts: { host: string; port: number }) => Promise<string>; server: { address: () => unknown } },
  config: Config,
) => {
  await app.listen({ host: config.host, port: 0 })
  const address = app.server.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected bound server address")
  }

  return `ws://${config.host}:${address.port}/v1/events`
}

const collectFramesUntil = (params: {
  url: string
  until: (frames: Event[][]) => boolean
  timeoutMs?: number
}): { framesPromise: Promise<Event[][]>; whenOpen: Promise<void> } => {
  let resolveOpen: (() => void) | undefined

  const whenOpen = new Promise<void>((resolve) => {
    resolveOpen = resolve
  })

  const framesPromise = new Promise<Event[][]>((resolve, reject) => {
    const ws = new WebSocket(params.url)
    const frames: Event[][] = []
    const timeoutMs = params.timeoutMs ?? 3000
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("timed out collecting websocket frames"))
    }, timeoutMs)

    ws.addEventListener("open", () => {
      resolveOpen?.()
    })

    ws.addEventListener("message", (event) => {
      frames.push(EventFrameSchema.parse(JSON.parse(eventDataText(event.data))))
      if (params.until(frames)) {
        clearTimeout(timeout)
        ws.close()
        resolve(frames)
      }
    })

    ws.addEventListener("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })

  return { framesPromise, whenOpen }
}

const appendAndPublish = (
  journal: EventJournalRepository,
  commitPublisher: EventCommitPublisher,
  records: JournalAppendRecord[],
) => {
  const appended = journal.append({ records })
  expect(appended.ok).toBe(true)
  if (appended.ok) {
    commitPublisher.publish([...appended.value])
  }
}

const seedServerStatusEvents = (
  journal: EventJournalRepository,
  commitPublisher: EventCommitPublisher,
  count: number,
  startIndex = 0,
) => {
  const records = Array.from({ length: count }, (_, index) =>
    serverStatusRecord(
      `2026-07-24T12:${String(Math.floor((startIndex + index) / 60)).padStart(2, "0")}:${String((startIndex + index) % 60).padStart(2, "0")}.000Z`,
    ),
  )

  for (const record of records) {
    appendAndPublish(journal, commitPublisher, [record])
  }
}

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("GET /v1/events live delivery", () => {
  test("live-only receives commits after connect", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config, commitPublisher } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, commitPublisher, 2)

    const url = await getListeningUrl(app, config)
    const { framesPromise, whenOpen } = collectFramesUntil({
      url,
      until: (frames) => frames.flat().length >= 1,
    })

    await whenOpen
    appendAndPublish(journal, commitPublisher, [
      serverStatusRecord("2026-07-24T12:00:03.000Z"),
    ])

    const frames = await framesPromise
    const cursors = frames.flat().map((event) => event.cursor)

    expect(cursors).toEqual(["4"])
    await app.close()
  })

  test("reconnect from last delivered cursor resumes without duplicates", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config, commitPublisher } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, commitPublisher, 3)

    const url = await getListeningUrl(app, config)
    const firstCollection = collectFramesUntil({
      url: `${url}?cursor=0`,
      until: (frames) => frames.flat().length >= 4,
    })
    const firstFrames = await firstCollection.framesPromise
    const firstCursors = firstFrames.flat().map((event) => event.cursor)
    const lastDelivered = firstCursors.at(-1)
    expect(lastDelivered).toBeDefined()

    const liveCollection = collectFramesUntil({
      url,
      until: (frames) => frames.flat().length >= 1,
    })
    const reconnectCollection = collectFramesUntil({
      url: `${url}?cursor=${lastDelivered}`,
      until: (frames) => frames.flat().length >= 1,
    })

    await Promise.all([liveCollection.whenOpen, reconnectCollection.whenOpen])

    appendAndPublish(journal, commitPublisher, [
      serverStatusRecord("2026-07-24T12:00:04.000Z"),
    ])

    const liveFrames = await liveCollection.framesPromise
    const reconnectFrames = await reconnectCollection.framesPromise

    expect(liveFrames.flat().map((event) => event.cursor)).toEqual(["5"])
    expect(reconnectFrames.flat().map((event) => event.cursor)).toEqual(["5"])
    await app.close()
  })

  test("commits during replay hand off with no gap or duplicate", async () => {
      const dataDir = await createTempDataDir(resources)
      const { app, database, config, commitPublisher } = await createTestApp(
        resources,
        dataDir,
      )
      const journal = createEventJournalRepository(database)

      seedServerStatusEvents(journal, commitPublisher, 120)

      const url = await getListeningUrl(app, config)
      let appendedDuringReplay = false

      const { framesPromise, whenOpen } = collectFramesUntil({
        url: `${url}?cursor=0`,
        until: (frames) => {
          const cursors = frames.flat().map((event) => event.cursor)
          if (!appendedDuringReplay && cursors.includes("60")) {
            appendedDuringReplay = true
            appendAndPublish(journal, commitPublisher, [
              serverStatusRecord("2026-07-24T12:10:00.000Z"),
            ])
          }

          return cursors.includes("122")
        },
        timeoutMs: 15000,
      })

      await whenOpen
      const frames = await framesPromise
      const cursors = frames.flat().map((event) => event.cursor)

      expect(appendedDuringReplay).toBe(true)
      expect(cursors.filter((cursor) => cursor === "122")).toHaveLength(1)
      expect(cursors.at(-1)).toBe("122")
      await app.close()
  }, { timeout: 20_000 })

  test("preserves workspace filter during live delivery", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config, commitPublisher } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    const otherWorkspaceDir = await createWorkspaceDir(dataDir, "other-project")
    const otherWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      payload: { name: "Other", path: otherWorkspaceDir },
    })
    const otherWorkspace = JSON.parse(otherWorkspaceResponse.body) as { id: string }

    const url = await getListeningUrl(app, config)
    const { framesPromise, whenOpen } = collectFramesUntil({
      url: `${url}?workspaceId=${workspaceId}`,
      until: (frames) => frames.flat().length >= 1,
    })

    await whenOpen

    appendAndPublish(journal, commitPublisher, [
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
    ])

    const frames = await framesPromise
    const workspaceIds = frames.flat().map((event) => event.workspaceId)

    expect(workspaceIds.every((id) => id === workspaceId)).toBe(true)
    expect(workspaceIds).toContain(workspaceId)
    await app.close()
  })

  test("reconnect after server restart resumes from last cursor", async () => {
    const dataDir = await createTempDataDir(resources)
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })

    const startServer = async () => {
      const database = openDatabase({ dataDir: config.dataDir })
      const runtime = createRuntime("0.1.0")
      const { app, commitPublisher } = await createServer({ config, runtime, database })
      resources.addApp(app)
      return { app, database, commitPublisher }
    }

    const first = await startServer()
    const journal = createEventJournalRepository(first.database)
    seedServerStatusEvents(journal, first.commitPublisher, 2)

    const url = await getListeningUrl(first.app, config)
    const replayCollection = collectFramesUntil({
      url: `${url}?cursor=0`,
      until: (frames) => frames.flat().length >= 3,
    })
    const replayFrames = await replayCollection.framesPromise
    const lastCursor = replayFrames.flat().at(-1)?.cursor
    expect(lastCursor).toBe("3")

    await first.app.close()
    first.database.close()

    const second = await startServer()

    const resumedCollection = collectFramesUntil({
      url: `${await getListeningUrl(second.app, config)}?cursor=${lastCursor}`,
      until: (frames) => frames.flat().length >= 1,
    })

    await resumedCollection.whenOpen

    const secondJournal = createEventJournalRepository(second.database)
    appendAndPublish(secondJournal, second.commitPublisher, [
      serverStatusRecord("2026-07-24T12:00:03.000Z"),
    ])

    const resumedFrames = await resumedCollection.framesPromise

    expect(resumedFrames.flat().map((event) => event.cursor)).toEqual(["4"])
    await second.app.close()
    second.database.close()
  })

  test("removes commit subscribers when the socket closes", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config, commitPublisher } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, commitPublisher, 1)

    const url = await getListeningUrl(app, config)

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.addEventListener("open", () => {
        ws.close()
      })
      ws.addEventListener("close", () => {
        resolve()
      })
      ws.addEventListener("error", reject)
    })

    const { framesPromise, whenOpen } = collectFramesUntil({
      url,
      until: (frames) => frames.flat().length >= 1,
    })

    await whenOpen
    appendAndPublish(journal, commitPublisher, [
      serverStatusRecord("2026-07-24T12:00:05.000Z"),
    ])
    const frames = await framesPromise

    expect(frames.flat().map((event) => event.cursor)).toEqual(["3"])
    await app.close()
  })
})
