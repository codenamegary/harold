import { Event } from "contracts/events/event"
import { FastifyBaseLogger } from "fastify"
import { WebSocket } from "ws"
import { EventCommitPublisher } from "./commit.publisher"
import { EventJournalRepository, ParsedJournalRecord } from "./journal.repository"
import { loadTurnOutputContext, projectJournalEvents } from "./journal.transactional"
import { registerStreamConnection } from "./stream.connections"
import { ValidatedEventStreamHandshake } from "./stream.handshake"
import { replayJournalEvents } from "./stream.replay"
import {
  addQueuedRecords,
  closeSlowConsumer,
  createHeartbeatManager,
  createQueueMetrics,
  removeQueuedRecords,
} from "./stream.resilience"
import { sendStreamFrame } from "./stream.send"

const MAX_FRAME_EVENTS = 500

type ConnectionPhase = "setup" | "replay" | "handoff" | "live"

type RunStreamConnectionParams = {
  socket: WebSocket
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
  handshake: ValidatedEventStreamHandshake
  log: FastifyBaseLogger
}

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
      await sendStreamFrame({ socket: params.socket, events: frame })
    }
  }

  const flushRemaining = async (): Promise<void> => {
    if (pendingEvents.length > 0) {
      await sendStreamFrame({
        socket: params.socket,
        events: pendingEvents.splice(0, pendingEvents.length),
      })
    }
  }

  for (const record of params.records) {
    pendingEvents.push(...params.projector.projectRecord(record))
    await flushFullFrames()
  }

  await flushRemaining()
  return lastDeliveredCursor
}

const closeInternalError = (params: {
  socket: WebSocket
  log: FastifyBaseLogger
  error: unknown
  message: string
}): void => {
  params.log.error({ err: params.error }, params.message)
  if (params.socket.readyState === WebSocket.OPEN) {
    params.socket.close(1011, "internal error")
  }
}

export const runStreamConnection = async (params: RunStreamConnectionParams): Promise<void> => {
  const { socket, eventJournal, commitPublisher, handshake, log } = params
  const queuedRecords: ParsedJournalRecord[] = []
  const phaseState = { value: "setup" as ConnectionPhase }
  const lastSentCursorState = {
    value: handshake.mode === "replay" ? handshake.replayCursor : 0n,
  }
  const deliveryChainState = { promise: Promise.resolve() }
  const queueMetricsState = { value: createQueueMetrics() }
  const projector = createRecordProjector(eventJournal)
  const unregisterConnection = registerStreamConnection(socket)
  const heartbeat = createHeartbeatManager({ socket })
  const cleanupState = { done: false }

  const cleanup = () => {
    if (cleanupState.done) {
      return
    }

    cleanupState.done = true
    heartbeat.stop()
    unsubscribe()
    unregisterConnection()
  }

  const queueRecordsForDelivery = (records: ParsedJournalRecord[]) => {
    if (records.length === 0) {
      return
    }

    const queued = addQueuedRecords({ metrics: queueMetricsState.value, records })
    queueMetricsState.value = queued.metrics
    if (queued.exceeded) {
      closeSlowConsumer(socket)
      return
    }

    deliveryChainState.promise = deliveryChainState.promise
      .then(async () => {
        const cursor = await deliverRecords({
          socket,
          records,
          projector,
        })
        lastSentCursorState.value = cursor
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === "slow consumer") {
          cleanup()
          return
        }

        closeInternalError({
          socket,
          log,
          error,
          message: "event stream delivery failed",
        })
        cleanup()
      })
      .finally(() => {
        queueMetricsState.value = removeQueuedRecords({
          metrics: queueMetricsState.value,
          records,
        })
      })
  }

  const unsubscribe = commitPublisher.subscribe(handshake.filters, (record) => {
    if (phaseState.value === "live") {
      if (record.cursor <= lastSentCursorState.value) {
        return
      }

      queueRecordsForDelivery([record])
      return
    }

    queuedRecords.push(record)
    const queued = addQueuedRecords({ metrics: queueMetricsState.value, records: [record] })
    queueMetricsState.value = queued.metrics
    if (queued.exceeded) {
      closeSlowConsumer(socket)
    }
  })

  socket.on("close", cleanup)
  socket.on("error", cleanup)

  try {
    if (handshake.mode === "live-only") {
      lastSentCursorState.value = eventJournal.getHighWaterCursor()
      queuedRecords.length = 0
      phaseState.value = "live"
      return
    }

    const highWaterCursor = eventJournal.getHighWaterCursor()
    phaseState.value = "replay"

    const replayResult = await replayJournalEvents({
      socket,
      eventJournal,
      requestedCursor: handshake.replayCursor,
      highWaterCursor,
      filters: handshake.filters,
      log,
    })

    lastSentCursorState.value = replayResult.lastReplayedCursor

    if (replayResult.status === "corruption") {
      cleanup()
      return
    }

    phaseState.value = "handoff"

    while (queuedRecords.length > 0) {
      const pending = queuedRecords.splice(0)
      queueMetricsState.value = removeQueuedRecords({
        metrics: queueMetricsState.value,
        records: pending,
      })

      const toDeliver = sortRecordsByCursor(
        pending.filter(
          (record) =>
            record.cursor > highWaterCursor && record.cursor > lastSentCursorState.value,
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
      lastSentCursorState.value = deliveredCursor
    }

    await deliveryChainState.promise
    phaseState.value = "live"
  } catch (error: unknown) {
    closeInternalError({
      socket,
      log,
      error,
      message: "event stream connection failed",
    })
    cleanup()
  }
}
