import { JournalAppendRecord } from "contracts/events/journal-record"
import { Event } from "contracts/events/event"
import { AgentDatabase, DbExecutor } from "../persistence/open-database"
import { EventCommitPublisher } from "./commit.publisher"
import { EventJournalRepository, ParsedJournalRecord } from "./event-journal-repository"
import { projectLifecycleEvents } from "./lifecycle.projectors"

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

    const events: Event[] = projectLifecycleEvents(outcome.appendedRecords)
    context.commitPublisher.publish(events)

    return { ok: true, value: outcome.value }
  } catch (error: unknown) {
    if (isTransactionAbort(error)) {
      return { ok: false, error: error.error as E | TransactionalJournalError }
    }

    throw error
  }
}
