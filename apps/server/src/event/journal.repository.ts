import { and, asc, eq, max, SQL, sql } from "drizzle-orm"
import {
  JournalAppendRecord,
  JournalAppendRecordSchema,
  JournalDirection,
  JournalDirectionSchema,
  JournalPhase,
  JournalPhaseSchema,
  JournalRecordKind,
  JournalRecordKindSchema,
} from "contracts/events/journal-record"
import { AgentDatabase, DbExecutor } from "../persistence/database"
import { events } from "../persistence/schema/events"
import {
  EventJournalCorruptionError,
  EventJournalRepositoryResult,
  parseJournalPayload,
} from "./event-journal-errors"

export type ParsedJournalRecord = {
  cursor: bigint
  schemaVersion: number
  kind: JournalRecordKind
  occurredAt: string
  workspaceId: string | null
  sessionId: string | null
  sessionSequence: number | null
  turnId: string | null
  protocolVersion: number | null
  direction: JournalDirection | null
  method: string | null
  phase: JournalPhase | null
  payload: unknown
}

export type AppendJournalRecordsInput = {
  records: JournalAppendRecord[]
  executor?: DbExecutor
}

export type ReadJournalAfterInput = {
  cursor: bigint
  limit: number
  workspaceId?: string
  sessionId?: string
  turnId?: string
  executor?: DbExecutor
}

export type DeleteJournalByWorkspaceInput = {
  workspaceId: string
  executor?: DbExecutor
}

type EventRow = typeof events.$inferSelect

const sessionScopedKinds = new Set<JournalRecordKind>([
  "session.created",
  "session.state",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
  "acp.request",
  "acp.response",
  "acp.notification",
  "acp.permission",
])

const isConstraintError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("UNIQUE constraint failed")

const readSessionId = (record: JournalAppendRecord): string | undefined =>
  "sessionId" in record ? record.sessionId : undefined

const readWorkspaceId = (record: JournalAppendRecord): string | null =>
  "workspaceId" in record ? record.workspaceId : null

const readTurnId = (record: JournalAppendRecord): string | null =>
  "turnId" in record ? (record.turnId ?? null) : null

const readProtocolVersion = (record: JournalAppendRecord): number | null =>
  "protocolVersion" in record ? record.protocolVersion : null

const readDirection = (record: JournalAppendRecord): JournalDirection | null =>
  "direction" in record ? record.direction : null

const readMethod = (record: JournalAppendRecord): string | null =>
  "method" in record ? record.method : null

const readPhase = (record: JournalAppendRecord): JournalPhase | null =>
  "phase" in record ? record.phase : null

const rowToCorruption = (row: EventRow): EventJournalCorruptionError => {
  const kind = JournalRecordKindSchema.safeParse(row.kind)
  return {
    kind: "corruption",
    cursor: BigInt(row.cursor),
    recordKind: kind.success ? kind.data : "server.status",
    schemaVersion: row.schemaVersion,
  }
}

const parseStoredKind = (
  row: EventRow,
): EventJournalRepositoryResult<JournalRecordKind> => {
  const parsed = JournalRecordKindSchema.safeParse(row.kind)
  if (!parsed.success) {
    return { ok: false, error: rowToCorruption(row) }
  }

  return { ok: true, value: parsed.data }
}

const parseStoredDirection = (
  direction: string | null,
): JournalDirection | null => {
  if (direction === null) {
    return null
  }

  const parsed = JournalDirectionSchema.safeParse(direction)
  return parsed.success ? parsed.data : null
}

const parseStoredPhase = (phase: string | null): JournalPhase | null => {
  if (phase === null) {
    return null
  }

  const parsed = JournalPhaseSchema.safeParse(phase)
  return parsed.success ? parsed.data : null
}

const parsePayloadJson = (
  row: EventRow,
): EventJournalRepositoryResult<unknown> => {
  try {
    return { ok: true, value: JSON.parse(row.payload) as unknown }
  } catch {
    return { ok: false, error: rowToCorruption(row) }
  }
}

const buildScopeConditions = (params: ReadJournalAfterInput): SQL[] => {
  const conditions: SQL[] = [sql`${events.cursor} > ${params.cursor}`]

  if (params.workspaceId !== undefined) {
    conditions.push(eq(events.workspaceId, params.workspaceId))
  }

  if (params.sessionId !== undefined) {
    conditions.push(eq(events.sessionId, params.sessionId))
  }

  if (params.turnId !== undefined) {
    conditions.push(eq(events.turnId, params.turnId))
  }

  return conditions
}

export const createEventJournalRepository = (database: AgentDatabase) => {
  const resolveExecutor = (executor?: DbExecutor): DbExecutor => executor ?? database.db

  const readMaxSessionSequence = (executor: DbExecutor, sessionId: string): number =>
    executor
      .select({ value: max(events.sessionSequence) })
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .get()?.value ?? 0

  const allocateSessionSequences = (
    executor: DbExecutor,
    records: JournalAppendRecord[],
  ): number[] => {
    const initialMaxBySession = new Map<string, number>()
    const runningBySession = new Map<string, number>()

    return records.map((record) => {
      const sessionId = readSessionId(record)
      if (sessionId === undefined || !sessionScopedKinds.has(record.kind)) {
        return 0
      }

      if (!initialMaxBySession.has(sessionId)) {
        initialMaxBySession.set(sessionId, readMaxSessionSequence(executor, sessionId))
        runningBySession.set(sessionId, readMaxSessionSequence(executor, sessionId))
      }

      const nextSequence = (runningBySession.get(sessionId) ?? 0) + 1
      runningBySession.set(sessionId, nextSequence)
      return nextSequence
    })
  }

  const appendOne = (
    executor: DbExecutor,
    record: JournalAppendRecord,
    sessionSequence: number | null,
  ): EventJournalRepositoryResult<ParsedJournalRecord> => {
    const inserted = executor
      .insert(events)
      .values({
        schemaVersion: record.schemaVersion,
        kind: record.kind,
        occurredAt: record.occurredAt,
        workspaceId: readWorkspaceId(record),
        sessionId: readSessionId(record) ?? null,
        sessionSequence,
        turnId: readTurnId(record),
        protocolVersion: readProtocolVersion(record),
        direction: readDirection(record),
        method: readMethod(record),
        phase: readPhase(record),
        payload: JSON.stringify(record.payload),
      })
      .returning()
      .get()

    if (inserted === undefined) {
      return { ok: false, error: { kind: "invalid_payload" } }
    }

    return parseRow(inserted)
  }

  const append = ({
    records,
    executor,
  }: AppendJournalRecordsInput): EventJournalRepositoryResult<ParsedJournalRecord[]> => {
    const validatedRecords = records.map((record) => JournalAppendRecordSchema.safeParse(record))
    if (validatedRecords.some((result) => !result.success)) {
      return { ok: false, error: { kind: "invalid_payload" } }
    }

    const parsedRecords = validatedRecords.flatMap((result) =>
      result.success ? [result.data] : [],
    )

    const db = resolveExecutor(executor)
    const sessionSequences = allocateSessionSequences(db, parsedRecords)

    const appendResults = parsedRecords.reduce<EventJournalRepositoryResult<ParsedJournalRecord[]>>(
      (accumulator, record, index) => {
        if (!accumulator.ok) {
          return accumulator
        }

        const sessionId = readSessionId(record)
        const sessionSequence =
          sessionId !== undefined && sessionScopedKinds.has(record.kind)
            ? sessionSequences[index]
            : null

        try {
          const appended = appendOne(db, record, sessionSequence)
          if (!appended.ok) {
            return appended
          }

          return { ok: true, value: [...accumulator.value, appended.value] }
        } catch (error: unknown) {
          if (isConstraintError(error)) {
            return { ok: false, error: { kind: "duplicate_session_sequence" } }
          }

          throw error
        }
      },
      { ok: true, value: [] },
    )

    return appendResults
  }

  const parseRow = (row: EventRow): EventJournalRepositoryResult<ParsedJournalRecord> => {
    const kind = parseStoredKind(row)
    if (!kind.ok) {
      return kind
    }

    const payloadJson = parsePayloadJson(row)
    if (!payloadJson.ok) {
      return payloadJson
    }

    const payload = parseJournalPayload({
      kind: kind.value,
      schemaVersion: row.schemaVersion,
      payload: payloadJson.value,
    })

    if (!payload.ok) {
      return { ok: false, error: rowToCorruption(row) }
    }

    const direction = parseStoredDirection(row.direction)
    const phase = parseStoredPhase(row.phase)
    if (
      (row.direction !== null && direction === null) ||
      (row.phase !== null && phase === null)
    ) {
      return { ok: false, error: rowToCorruption(row) }
    }

    return {
      ok: true,
      value: {
        cursor: BigInt(row.cursor),
        schemaVersion: row.schemaVersion,
        kind: kind.value,
        occurredAt: row.occurredAt,
        workspaceId: row.workspaceId,
        sessionId: row.sessionId,
        sessionSequence: row.sessionSequence,
        turnId: row.turnId,
        protocolVersion: row.protocolVersion,
        direction,
        method: row.method,
        phase,
        payload: payload.value,
      },
    }
  }

  const readAfter = (
    params: ReadJournalAfterInput,
  ): EventJournalRepositoryResult<ParsedJournalRecord[]> => {
    const db = resolveExecutor(params.executor)
    const rows = db
      .select()
      .from(events)
      .where(and(...buildScopeConditions(params)))
      .orderBy(asc(events.cursor))
      .limit(params.limit)
      .all()

    const readResults = rows.reduce<EventJournalRepositoryResult<ParsedJournalRecord[]>>(
      (accumulator, row) => {
        if (!accumulator.ok) {
          return accumulator
        }

        const parsed = parseRow(row)
        if (!parsed.ok) {
          return parsed
        }

        return { ok: true, value: [...accumulator.value, parsed.value] }
      },
      { ok: true, value: [] },
    )

    return readResults
  }

  const getHighWaterCursor = (executor?: DbExecutor): bigint => {
    const db = resolveExecutor(executor)
    const row = db.select({ value: max(events.cursor) }).from(events).get()
    return BigInt(row?.value ?? 0)
  }

  const deleteByWorkspace = ({ workspaceId, executor }: DeleteJournalByWorkspaceInput): void => {
    const db = resolveExecutor(executor)
    db.delete(events).where(eq(events.workspaceId, workspaceId)).run()
  }

  return {
    append,
    readAfter,
    getHighWaterCursor,
    parseRow,
    deleteByWorkspace,
  }
}

export type EventJournalRepository = ReturnType<typeof createEventJournalRepository>
