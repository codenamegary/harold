import { JournalAppendRecord } from "contracts/events/journal-record"
import { AgentDatabase } from "../../persistence/database"
import { EventCommitPublisher } from "../../event/commit.publisher"
import { EventJournalRepository } from "../../event/journal.repository"
import { loadTurnOutputContext, projectJournalEvents } from "../../event/journal.transactional"
import { runTransactionalJournal, TransactionalJournalResult } from "../../event/journal.transactional"

type TransactionWork<T, E> = Parameters<typeof runTransactionalJournal<T, E>>[1]

export type AcpJournalWriter = {
  appendAndPublish: (records: JournalAppendRecord[]) => { ok: true } | { ok: false }
  runTransactional: <T, E>(
    work: TransactionWork<T, E>,
  ) => TransactionalJournalResult<T, E>
}

export type CreateAcpJournalWriterParams = {
  database: AgentDatabase
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
}

export const createAcpJournalWriter = ({
  database,
  eventJournal,
  commitPublisher,
}: CreateAcpJournalWriterParams): AcpJournalWriter => {
  const appendAndPublish = (records: JournalAppendRecord[]) => {
    const appendResult = eventJournal.append({ records })
    if (!appendResult.ok) {
      return { ok: false as const }
    }

    const contextRecords = appendResult.value
      .filter((record) => record.kind === "turn.completed" && record.turnId !== null)
      .flatMap((record) => {
        const turnId = record.turnId as string
        const readResult = eventJournal.readAfter({ cursor: 0n, limit: 10_000, turnId })
        if (!readResult.ok) {
          return []
        }

        return loadTurnOutputContext(readResult.value, turnId)
      })

    const events = projectJournalEvents({
      appendedRecords: appendResult.value,
      contextRecords,
    })
    commitPublisher.publish(events)

    return { ok: true as const }
  }

  const runTransactional = <T, E>(work: Parameters<typeof runTransactionalJournal<T, E>>[1]) =>
    runTransactionalJournal<T, E>(
      {
        database,
        eventJournal,
        commitPublisher,
      },
      work,
    )

  return {
    appendAndPublish,
    runTransactional,
  }
}
