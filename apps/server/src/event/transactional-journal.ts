import { JournalAppendRecord } from "contracts/events/journal-record"
import { Event } from "contracts/events/event"
import { AgentDatabase, DbExecutor } from "../persistence/open-database"
import { EventCommitPublisher } from "./event-commit-publisher"
import { EventJournalRepository, ParsedJournalRecord } from "./event-journal-repository"
import { projectLifecycleEvents } from "./project-lifecycle-event"

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
  | { ok: true; value: T }
  | { ok: false; error: E | TransactionalJournalError }

type TransactionWork<T, E> = (params: {
  executor: DbExecutor
  append: (records: JournalAppendRecord[]) => TransactionalJournalResult<void>
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

export const runTransactionalJournal = <T, E = TransactionalJournalError>(
  context: TransactionalJournalContext,
  work: TransactionWork<T, E>,
): TransactionalJournalResult<T, E> => {
  const committedRecords: ParsedJournalRecord[] = []

  try {
    const value = context.database.db.transaction((executor) => {
      const append = (records: JournalAppendRecord[]): TransactionalJournalResult<void> => {
        const result = context.eventJournal.append({ records, executor })
        if (!result.ok) {
          return { ok: false, error: { kind: "journal_append_failed" } }
        }

        committedRecords.push(...result.value)
        return { ok: true, value: undefined }
      }

      const result = work({ executor, append })
      if (!result.ok) {
        throw transactionAbort(result.error)
      }

      return result.value
    })

    const events: Event[] = projectLifecycleEvents(committedRecords)
    context.commitPublisher.publish(events)

    return { ok: true, value }
  } catch (error: unknown) {
    if (isTransactionAbort(error)) {
      return { ok: false, error: error.error as E | TransactionalJournalError }
    }

    throw error
  }
}
