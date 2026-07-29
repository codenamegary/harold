import { AgentServerState } from "contracts/http/status"
import { JOURNAL_SCHEMA_VERSION } from "contracts/events/journal-record"
import { AgentDatabase } from "../persistence/open-database"
import { Runtime } from "./runtime"
import { EventCommitPublisher } from "../event/event-commit-publisher"
import { EventJournalRepository } from "../event/event-journal-repository"
import { runTransactionalJournal } from "../event/transactional-journal"

type RuntimeStatusServiceContext = {
  database: AgentDatabase
  runtime: Runtime
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
}

const nowIso = (): string => new Date().toISOString()

export const createRuntimeStatusService = (context: RuntimeStatusServiceContext) => {
  const persist = (state: AgentServerState): void => {
    const occurredAt = nowIso()

    const result = runTransactionalJournal(
      {
        database: context.database,
        eventJournal: context.eventJournal,
        commitPublisher: context.commitPublisher,
      },
      (params) => {
        const appendResult = params.append([
          {
            schemaVersion: JOURNAL_SCHEMA_VERSION,
            kind: "server.status",
            occurredAt,
            payload: { state },
          },
        ])

        if (!appendResult.ok) {
          return appendResult
        }

        return { ok: true, value: undefined, appendedRecords: appendResult.value }
      },
    )

    if (result.ok) {
      context.runtime.setState(state)
    }
  }

  return {
    persistStarting: () => persist("starting"),
    persistOnline: () => persist("online"),
    persistShuttingDown: () => persist("shutting_down"),
    persistOffline: () => persist("offline"),
  }
}

export type RuntimeStatusService = ReturnType<typeof createRuntimeStatusService>
