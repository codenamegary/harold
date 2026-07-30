import { Event } from "contracts/events/event"
import { EventFrameSchema } from "contracts/events/stream"
import { FastifyBaseLogger } from "fastify"
import { WebSocket } from "ws"
import { eventCursorToString } from "./cursor"
import { EventJournalCorruptionError } from "./event-journal-errors"
import { EventJournalRepository, ParsedJournalRecord } from "./journal.repository"
import { loadTurnOutputContext, projectJournalEvents } from "./journal.transactional"
import { EventStreamFilters } from "./stream.handshake"

const MAX_FRAME_EVENTS = 500

type ReplayJournalEventsParams = {
  socket: WebSocket
  eventJournal: EventJournalRepository
  requestedCursor: bigint
  highWaterCursor?: bigint
  filters: EventStreamFilters
  log: FastifyBaseLogger
}

export type ReplayJournalEventsResult = {
  status: "complete" | "corruption"
  lastReplayedCursor: bigint
}

const logJournalCorruption = (
  log: FastifyBaseLogger,
  error: EventJournalCorruptionError,
): void => {
  log.error(
    {
      cursor: eventCursorToString(error.cursor),
      recordKind: error.recordKind,
      schemaVersion: error.schemaVersion,
    },
    "journal corruption during event replay",
  )
}

const loadTurnContextRecords = (
  eventJournal: EventJournalRepository,
  turnId: string,
): ParsedJournalRecord[] => {
  const readResult = eventJournal.readAfter({
    cursor: 0n,
    limit: 10_000,
    turnId,
  })

  if (!readResult.ok) {
    return []
  }

  return loadTurnOutputContext(readResult.value, turnId)
}

const projectReplayRecord = (
  record: ParsedJournalRecord,
  contextByTurnId: ReadonlyMap<string, ParsedJournalRecord[]>,
): Event[] => {
  const contextRecords =
    record.kind === "turn.completed" && record.turnId !== null
      ? (contextByTurnId.get(record.turnId) ?? [])
      : []

  return projectJournalEvents({
    appendedRecords: [record],
    contextRecords,
  })
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

export const replayJournalEvents = async (
  params: ReplayJournalEventsParams,
): Promise<ReplayJournalEventsResult> => {
  const pendingEvents: Event[] = []
  const contextByTurnId = new Map<string, ParsedJournalRecord[]>()
  let journalCursor = params.requestedCursor
  let lastReplayedCursor = params.requestedCursor

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

  while (true) {
    const readResult = params.eventJournal.readAfter({
      cursor: journalCursor,
      limit: 1,
      ...params.filters,
    })

    if (!readResult.ok) {
      if (readResult.error.kind !== "corruption") {
        throw new Error("unexpected journal read error during replay")
      }

      await flushRemaining()
      logJournalCorruption(params.log, readResult.error)
      params.socket.close(1011, "journal corruption")
      return { status: "corruption", lastReplayedCursor }
    }

    const record = readResult.value[0]
    if (record === undefined) {
      break
    }

    if (
      params.highWaterCursor !== undefined &&
      record.cursor > params.highWaterCursor
    ) {
      break
    }

    if (record.kind === "turn.completed" && record.turnId !== null) {
      const turnId = record.turnId
      if (!contextByTurnId.has(turnId)) {
        contextByTurnId.set(turnId, loadTurnContextRecords(params.eventJournal, turnId))
      }
    }

    pendingEvents.push(...projectReplayRecord(record, contextByTurnId))
    await flushFullFrames()
    journalCursor = record.cursor
    lastReplayedCursor = record.cursor
  }

  await flushRemaining()
  return { status: "complete", lastReplayedCursor }
}
