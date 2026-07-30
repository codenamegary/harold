import { afterEach, describe, expect, test } from "bun:test"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import { WebSocket } from "ws"
import { listen } from "../bootstrap/shutdown"
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
import { Config } from "../config/config"
import { EventCommitPublisher } from "./commit.publisher"
import {
  createEventJournalRepository,
  EventJournalRepository,
} from "./journal.repository"
import { JournalAppendRecord } from "contracts/events/journal-record"
import {
  createHeartbeatManager,
  MAX_QUEUE_RECORDS,
  SLOW_CONSUMER_CLOSE_CODE,
  SLOW_CONSUMER_CLOSE_REASON,
} from "./stream.resilience"
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

const waitForClose = (socket: WebSocket, timeoutMs = 5000): Promise<{ code: number; reason: string }> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for websocket close"))
    }, timeoutMs)

    socket.on("close", (code: number, reason: Buffer) => {
      clearTimeout(timeout)
      resolve({ code, reason: reason.toString() })
    })

    socket.on("error", (error: Error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })

const collectFramesUntil = (params: {
  url: string
  until: (frames: Event[][]) => boolean
  timeoutMs?: number
}): { framesPromise: Promise<Event[][]>; whenOpen: Promise<void> } => {
  const openState: { resolve: (() => void) | undefined } = { resolve: undefined }

  const whenOpen = new Promise<void>((resolve) => {
    openState.resolve = resolve
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
      openState.resolve?.()
    })

    ws.addEventListener("message", (event) => {
      frames.push(EventFrameSchema.parse(JSON.parse(String(event.data))))
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

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("event stream resilience", () => {
  test("terminates stale sockets after a missed heartbeat interval", async () => {
    const socketState = { readyState: WebSocket.OPEN }
    const handlers = new Map<string, Set<() => void>>()
    const socket = {
      get readyState() {
        return socketState.readyState
      },
      ping: () => {},
      terminate: () => {
        socketState.readyState = WebSocket.CLOSED
      },
      on: (event: string, handler: () => void) => {
        const eventHandlers = handlers.get(event) ?? new Set<() => void>()
        eventHandlers.add(handler)
        handlers.set(event, eventHandlers)
      },
      off: (event: string, handler: () => void) => {
        handlers.get(event)?.delete(handler)
      },
    } as WebSocket

    const heartbeatIntervalMs = 30
    const heartbeat = createHeartbeatManager({ socket, intervalMs: heartbeatIntervalMs })
    await Bun.sleep(heartbeatIntervalMs + 10)
    await Bun.sleep(heartbeatIntervalMs + 10)
    heartbeat.stop()

    expect(socketState.readyState).toBe(WebSocket.CLOSED)
  })

  test("closes slow consumers with code 1008 and allows reconnect without loss", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config, commitPublisher } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, commitPublisher, 3)

    const url = await getListeningUrl(app, config)
    const firstCollection = collectFramesUntil({
      url: `${url}?cursor=0`,
      until: (frames) => frames.flat().length >= 3,
    })
    const firstFrames = await firstCollection.framesPromise
    const lastDelivered = firstFrames.flat().at(-1)?.cursor
    expect(lastDelivered).toBeDefined()

    const slowSocket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      slowSocket.addEventListener("open", () => resolve())
      slowSocket.addEventListener("error", reject)
    })

    for (const index of Array.from({ length: MAX_QUEUE_RECORDS + 5 }, (_, value) => value)) {
      appendAndPublish(journal, commitPublisher, [
        serverStatusRecord(`2026-07-24T13:${String(index % 60).padStart(2, "0")}:00.000Z`),
      ])
    }

    const closeEvent = await waitForClose(slowSocket)
    expect(closeEvent.code).toBe(SLOW_CONSUMER_CLOSE_CODE)
    expect(closeEvent.reason).toBe(SLOW_CONSUMER_CLOSE_REASON)

    const reconnectCollection = collectFramesUntil({
      url: `${url}?cursor=${lastDelivered}`,
      until: (frames) => frames.flat().length >= MAX_QUEUE_RECORDS + 5,
      timeoutMs: 15000,
    })
    await reconnectCollection.whenOpen

    appendAndPublish(journal, commitPublisher, [
      serverStatusRecord("2026-07-24T14:00:00.000Z"),
    ])

    const reconnectFrames = await reconnectCollection.framesPromise
    const reconnectCursors = reconnectFrames.flat().map((event) => event.cursor)
    const expectedCursors = Array.from(
      { length: MAX_QUEUE_RECORDS + 5 },
      (_, index) => String(5 + index),
    )

    expect(reconnectCursors).toEqual(expectedCursors)
    await app.close()
  })

  test("does not block filtered clients when another workspace is slow", async () => {
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

    const slowSocket = new WebSocket(`${url}?workspaceId=${workspaceId}`)
    await new Promise<void>((resolve, reject) => {
      slowSocket.addEventListener("open", () => resolve())
      slowSocket.addEventListener("error", reject)
    })

    const fastCollection = collectFramesUntil({
      url: `${url}?workspaceId=${otherWorkspace.id}`,
      until: (frames) => frames.flat().length >= 1,
    })
    await fastCollection.whenOpen

    for (const index of Array.from({ length: MAX_QUEUE_RECORDS + 5 }, (_, value) => value)) {
      appendAndPublish(journal, commitPublisher, [
        {
          schemaVersion: 1,
          kind: "session.state",
          occurredAt: `2026-07-24T15:${String(index % 60).padStart(2, "0")}:00.000Z`,
          workspaceId,
          sessionId: "sess-slow",
          payload: { state: "idle" },
        },
      ])
    }

    appendAndPublish(journal, commitPublisher, [
      {
        schemaVersion: 1,
        kind: "session.state",
        occurredAt: "2026-07-24T16:00:00.000Z",
        workspaceId: otherWorkspace.id,
        sessionId: "sess-fast",
        payload: { state: "idle" },
      },
    ])

    const fastFrames = await fastCollection.framesPromise
    const fastWorkspaceIds = fastFrames.flat().map((event) => event.workspaceId)

    expect(fastWorkspaceIds).toEqual([otherWorkspace.id])
    await app.close()
  })

  test("persists shutting_down and offline while closing active sockets", async () => {
    const dataDir = await createTempDataDir(resources)
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { app, acpSupervisor, runtimeStatusService, sessionService, disposeOfflineOnBindingClear } =
      await createServer({
        config,
        runtime,
        database,
      })

    await listen(app, config, runtimeStatusService)

    const address = app.server.address()
    if (address === null || typeof address === "string") {
      throw new Error("expected bound server address")
    }
    const url = `ws://${config.host}:${address.port}/v1/events`
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve())
      socket.addEventListener("error", reject)
    })

    const closeEventPromise = waitForClose(socket)
    const { runShutdown } = await import("../bootstrap/shutdown")

    await runShutdown({
      app,
      database,
      acpSupervisor,
      runtimeStatusService,
      sessionService,
      disposeOfflineOnBindingClear,
      exit: () => {
        throw new Error("shutdown-exit")
      },
    }).catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "shutdown-exit") {
        throw error
      }
    })

    const closeEvent = await closeEventPromise
    expect(closeEvent.reason).toBe("server shutting down")
    expect([1000, 1001]).toContain(closeEvent.code)
    expect(socket.readyState).toBe(WebSocket.CLOSED)

    const readDatabase = openDatabase({ dataDir: config.dataDir })
    const readJournal = createEventJournalRepository(readDatabase)
    const finalRecords = readJournal.readAfter({ cursor: 0n, limit: 20 })
    readDatabase.close()
    expect(finalRecords.ok).toBe(true)
    if (!finalRecords.ok) {
      return
    }

    const statuses = finalRecords.value
      .filter((record) => record.kind === "server.status")
      .map((record) => (record.payload as { state: string }).state)

    expect(statuses).toEqual(["starting", "online", "shutting_down", "offline"])
  })

  test("cleans up heartbeat timers and subscribers after socket close", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, database, config, commitPublisher } = await createTestApp(resources, dataDir)
    const journal = createEventJournalRepository(database)

    seedServerStatusEvents(journal, commitPublisher, 1)

    const url = await getListeningUrl(app, config)
    const socket = new WebSocket(url)

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => {
        socket.close()
      })
      socket.addEventListener("close", () => resolve())
      socket.addEventListener("error", reject)
    })

    const { framesPromise, whenOpen } = collectFramesUntil({
      url,
      until: (frames) => frames.flat().length >= 1,
    })

    await whenOpen
    appendAndPublish(journal, commitPublisher, [
      serverStatusRecord("2026-07-24T17:00:00.000Z"),
    ])

    const frames = await framesPromise
    expect(frames.flat().map((event) => event.cursor)).toEqual(["3"])
    await app.close()
  })
})

describe("stream.send", () => {
  test("closes slow consumers when bufferedAmount exceeds 1 MiB", async () => {
    const { sendStreamFrame } = await import("./stream.send")
    const { MAX_BUFFERED_BYTES, SLOW_CONSUMER_CLOSE_CODE, SLOW_CONSUMER_CLOSE_REASON } =
      await import("./stream.resilience")
    const closeState = { code: 0, reason: "" }
    const socket = {
      bufferedAmount: MAX_BUFFERED_BYTES + 1,
      readyState: WebSocket.OPEN,
      close: (code: number, reason: string) => {
        closeState.code = code
        closeState.reason = reason
      },
      send: () => {},
    } as WebSocket

    await expect(
      sendStreamFrame({
        socket,
        events: [
          {
            type: "server.status",
            cursor: "1",
            occurredAt: "2026-07-24T12:00:00.000Z",
            workspaceId: null,
            payload: { state: "online" },
          },
        ],
      }),
    ).rejects.toThrow("slow consumer")

    expect(closeState.code).toBe(SLOW_CONSUMER_CLOSE_CODE)
    expect(closeState.reason).toBe(SLOW_CONSUMER_CLOSE_REASON)
  })
})

describe("stream.connections", () => {
  test("closes registered sockets with code 1001", async () => {
    const { WebSocketServer } = await import("ws")
    const { closeAllStreamConnections, registerStreamConnection } = await import(
      "./stream.connections"
    )
    const server = new WebSocketServer({ port: 0 })
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("expected bound server address")
    }

    const clientReady = new Promise<void>((resolve, reject) => {
      server.on("connection", (socket) => {
        registerStreamConnection(socket)
        resolve()
      })
      server.on("error", reject)
    })

    const client = new WebSocket(`ws://127.0.0.1:${address.port}`)
    await new Promise<void>((resolve, reject) => {
      client.addEventListener("open", () => resolve())
      client.addEventListener("error", reject)
    })
    await clientReady

    const closeEventPromise = waitForClose(client)
    closeAllStreamConnections()
    const closeEvent = await closeEventPromise

    expect(closeEvent.reason).toBe("server shutting down")
    expect([1000, 1001]).toContain(closeEvent.code)
    server.close()
  })
})

describe("stream.resilience helpers", () => {
  test("queue metrics enforce record limits", async () => {
    const { addQueuedRecords, createQueueMetrics } = await import("./stream.resilience")
    const metrics = createQueueMetrics()
    const record = {
      schemaVersion: 1 as const,
      kind: "server.status" as const,
      occurredAt: "2026-07-24T12:00:00.000Z",
      cursor: 1n,
      workspaceId: null,
      sessionId: null,
      sessionSequence: null,
      turnId: null,
      protocolVersion: null,
      direction: null,
      method: null,
      phase: null,
      payload: { state: "online" as const },
    }

    const records = Array.from({ length: MAX_QUEUE_RECORDS }, () => record)
    const firstBatch = addQueuedRecords({ metrics, records })
    expect(firstBatch.exceeded).toBe(false)
    const secondBatch = addQueuedRecords({ metrics: firstBatch.metrics, records: [record] })
    expect(secondBatch.exceeded).toBe(true)
  })
})
