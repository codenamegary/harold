import { JournalAppendRecord } from "contracts/events/journal-record"
import { Event } from "contracts/events/event"
import { AgentDatabase, DbExecutor } from "../persistence/database"
import { EventCommitPublisher } from "./commit.publisher"
import { EventJournalRepository, ParsedJournalRecord } from "./journal.repository"
import { parseAcpJournalRecords, isAcpJournalKind } from "./acp.models"
import { projectAcpEvents } from "./acp.projectors"
import { parseLifecycleJournalRecords } from "./lifecycle.models"
import { projectLifecycleEvents } from "./lifecycle.projectors"
import { lifecycleKinds } from "./lifecycle.models"

const isLifecycleKind = (kind: string): boolean =>
  (lifecycleKinds as ReadonlyArray<string>).includes(kind)

export const loadTurnOutputContext = (
  records: ReadonlyArray<ParsedJournalRecord>,
  turnId: string,
): ParsedJournalRecord[] =>
  records.filter(
    (record) =>
      record.kind === "acp.notification" &&
      record.turnId === turnId &&
      typeof record.payload === "object" &&
      record.payload !== null &&
      (record.payload as { updateKind?: string }).updateKind === "agent_message_chunk",
  )

export const projectJournalEvents = (params: {
  appendedRecords: ReadonlyArray<ParsedJournalRecord>
  contextRecords?: ReadonlyArray<ParsedJournalRecord>
}): Event[] => {
  const { appendedRecords, contextRecords = [] } = params

  const lifecycleRecords = parseLifecycleJournalRecords(
    appendedRecords.filter((record) => isLifecycleKind(record.kind)),
  )
  const acpAppended = parseAcpJournalRecords(
    appendedRecords.filter((record) => isAcpJournalKind(record.kind)),
  )
  const acpContext = parseAcpJournalRecords(
    contextRecords.filter((record) => isAcpJournalKind(record.kind)),
  )

  return [
    ...projectLifecycleEvents(lifecycleRecords),
    ...projectAcpEvents(acpAppended, acpContext),
  ]
}

export type TransactionalJournalError = { kind: "journal_append_failed" }

export type TransactionalJournalResult<T, E = TransactionalJournalError> =
  | { ok: true; value: T }
  | { ok: false; error: E | TransactionalJournalError }

type TransactionalJournalContext = {
  database: AgentDatabase
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
}

type TransactionWorkResult<T, E> =
  | {
      ok: true
      value: T
      appendedRecords: ReadonlyArray<ParsedJournalRecord>
    }
  | { ok: false; error: E | TransactionalJournalError }

type TransactionWork<T, E> = (params: {
  executor: DbExecutor
  append: (
    records: JournalAppendRecord[],
  ) => TransactionalJournalResult<ReadonlyArray<ParsedJournalRecord>>
}) => TransactionWorkResult<T, E>

type TransactionAbort = {
  readonly tag: "transaction_abort"
  readonly error: unknown
}

const transactionAbort = (error: unknown): TransactionAbort => ({
  tag: "transaction_abort",
  error,
})

const isTransactionAbort = (error: unknown): error is TransactionAbort =>
  typeof error === "object" &&
  error !== null &&
  (error as TransactionAbort).tag === "transaction_abort"

type TransactionOutcome<T> = {
  value: T
  appendedRecords: ReadonlyArray<ParsedJournalRecord>
}

export const runTransactionalJournal = <T, E = TransactionalJournalError>(
  context: TransactionalJournalContext,
  work: TransactionWork<T, E>,
): TransactionalJournalResult<T, E> => {
  try {
    const outcome = context.database.db.transaction((executor): TransactionOutcome<T> => {
      const append = (
        records: JournalAppendRecord[],
      ): TransactionalJournalResult<ReadonlyArray<ParsedJournalRecord>> => {
        const result = context.eventJournal.append({ records, executor })
        if (!result.ok) {
          return { ok: false, error: { kind: "journal_append_failed" } }
        }

        return { ok: true, value: result.value }
      }

      const result = work({ executor, append })
      if (!result.ok) {
        throw transactionAbort(result.error)
      }

      return {
        value: result.value,
        appendedRecords: result.appendedRecords,
      }
    })

    context.commitPublisher.publish([...outcome.appendedRecords])

    return { ok: true, value: outcome.value }
  } catch (error: unknown) {
    if (isTransactionAbort(error)) {
      return { ok: false, error: error.error as E | TransactionalJournalError }
    }

    throw error
  }
}
