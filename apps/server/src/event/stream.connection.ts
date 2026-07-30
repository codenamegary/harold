import { Event } from "contracts/events/event"
import { EventFrameSchema } from "contracts/events/stream"
import { FastifyBaseLogger } from "fastify"
import { WebSocket } from "ws"
import { EventCommitPublisher } from "./commit.publisher"
import { EventJournalRepository, ParsedJournalRecord } from "./journal.repository"
import { loadTurnOutputContext, projectJournalEvents } from "./journal.transactional"
import { ValidatedEventStreamHandshake } from "./stream.handshake"
import { replayJournalEvents } from "./stream.replay"

const MAX_FRAME_EVENTS = 500

type ConnectionPhase = "setup" | "replay" | "handoff" | "live"

type RunStreamConnectionParams = {
  socket: WebSocket
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
  handshake: ValidatedEventStreamHandshake
  log: FastifyBaseLogger
}

const sendFrame = (socket: WebSocket, events: Event[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const frame = EventFrameSchema.parse(events)
    socket.send(JSON.stringify(frame), (error) => {
      if (error !== undefined) {
        reject(error)
        return
      }

      resolve()
    })
  })

const sortRecordsByCursor = (records: ParsedJournalRecord[]): ParsedJournalRecord[] =>
  [...records].sort((left, right) => Number(left.cursor - right.cursor))

const createRecordProjector = (eventJournal: EventJournalRepository) => {
  const contextByTurnId = new Map<string, ParsedJournalRecord[]>()

  const loadTurnContext = (turnId: string): ParsedJournalRecord[] => {
    if (!contextByTurnId.has(turnId)) {
      const readResult = eventJournal.readAfter({
        cursor: 0n,
        limit: 10_000,
        turnId,
      })
      contextByTurnId.set(
        turnId,
        readResult.ok ? loadTurnOutputContext(readResult.value, turnId) : [],
      )
    }

    return contextByTurnId.get(turnId) ?? []
  }

  const projectRecord = (record: ParsedJournalRecord): Event[] => {
    const contextRecords =
      record.kind === "turn.completed" && record.turnId !== null
        ? loadTurnContext(record.turnId)
        : []

    return projectJournalEvents({
      appendedRecords: [record],
      contextRecords,
    })
  }

  return { projectRecord }
}

const deliverRecords = async (params: {
  socket: WebSocket
  records: ParsedJournalRecord[]
  projector: ReturnType<typeof createRecordProjector>
}): Promise<bigint> => {
  const pendingEvents: Event[] = []
  const lastDeliveredCursor =
    params.records.length > 0 ? params.records[params.records.length - 1].cursor : 0n

  const flushFullFrames = async (): Promise<void> => {
    while (pendingEvents.length >= MAX_FRAME_EVENTS) {
      const frame = pendingEvents.splice(0, MAX_FRAME_EVENTS)
      await sendFrame(params.socket, frame)
    }
  }

  const flushRemaining = async (): Promise<void> => {
    if (pendingEvents.length > 0) {
      await sendFrame(params.socket, pendingEvents.splice(0, pendingEvents.length))
    }
  }

  for (const record of params.records) {
    pendingEvents.push(...params.projector.projectRecord(record))
    await flushFullFrames()
  }

  await flushRemaining()
  return lastDeliveredCursor
}

export const runStreamConnection = async (params: RunStreamConnectionParams): Promise<void> => {
  const { socket, eventJournal, commitPublisher, handshake, log } = params
  const queuedRecords: ParsedJournalRecord[] = []
  let phase: ConnectionPhase = "setup"
  let lastSentCursor =
    handshake.mode === "replay" ? handshake.replayCursor : 0n
  let deliveryChain: Promise<void> = Promise.resolve()
  const projector = createRecordProjector(eventJournal)

  const enqueueDelivery = (records: ParsedJournalRecord[]) => {
    if (records.length === 0) {
      return
    }

    deliveryChain = deliveryChain.then(async () => {
      const cursor = await deliverRecords({
        socket,
        records,
        projector,
      })
      lastSentCursor = cursor
    })
  }

  const unsubscribe = commitPublisher.subscribe(handshake.filters, (record) => {
    if (phase === "live") {
      if (record.cursor <= lastSentCursor) {
        return
      }

      enqueueDelivery([record])
      return
    }

    queuedRecords.push(record)
  })

  const cleanup = () => {
    unsubscribe()
  }

  socket.on("close", cleanup)
  socket.on("error", cleanup)

  if (handshake.mode === "live-only") {
    lastSentCursor = eventJournal.getHighWaterCursor()
    queuedRecords.length = 0
    phase = "live"
    return
  }

  const highWaterCursor = eventJournal.getHighWaterCursor()
  phase = "replay"

  const replayResult = await replayJournalEvents({
    socket,
    eventJournal,
    requestedCursor: handshake.replayCursor,
    highWaterCursor,
    filters: handshake.filters,
    log,
  })

  lastSentCursor = replayResult.lastReplayedCursor

  if (replayResult.status === "corruption") {
    cleanup()
    return
  }

  phase = "handoff"

  while (queuedRecords.length > 0) {
    const pending = queuedRecords.splice(0)
    const toDeliver = sortRecordsByCursor(
      pending.filter(
        (record) => record.cursor > highWaterCursor && record.cursor > lastSentCursor,
      ),
    )

    if (toDeliver.length === 0) {
      continue
    }

    const deliveredCursor = await deliverRecords({
      socket,
      records: toDeliver,
      projector,
    })
    lastSentCursor = deliveredCursor
  }

  await deliveryChain
  phase = "live"
}
