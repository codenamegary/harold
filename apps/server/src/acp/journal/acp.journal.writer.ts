import { JournalAppendRecord } from "contracts/events/journal-record"
import { AgentDatabase } from "../../persistence/database"
import { EventCommitPublisher } from "../../event/commit.publisher"
import { EventJournalRepository } from "../../event/journal.repository"
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

    commitPublisher.publish([...appendResult.value])

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
