import { CreateWorkspaceBody, Workspace } from "contracts/http/workspace"
import { JOURNAL_SCHEMA_VERSION } from "contracts/events/journal-record"
import { AgentDatabase } from "../persistence/open-database"
import { EventCommitPublisher } from "../event/commit.publisher"
import { EventJournalRepository } from "../event/event-journal-repository"
import { runTransactionalJournal, TransactionalJournalError } from "../event/journal.transactional"
import {
  UpdateWorkspaceNameInput,
  WorkspaceRepository,
} from "./workspace-repository"
import { WorkspaceRepositoryError } from "./workspace-errors"

export type WorkspaceServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: WorkspaceRepositoryError | TransactionalJournalError }

type WorkspaceServiceContext = {
  database: AgentDatabase
  workspaceRepository: WorkspaceRepository
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
}

const nowIso = (): string => new Date().toISOString()

export const createWorkspaceService = (context: WorkspaceServiceContext) => {
  const transactional = <T, E>(
    work: Parameters<typeof runTransactionalJournal<T, E>>[1],
  ) =>
    runTransactionalJournal<T, E>(
      {
        database: context.database,
        eventJournal: context.eventJournal,
        commitPublisher: context.commitPublisher,
      },
      work,
    )

  const create = (input: CreateWorkspaceBody): WorkspaceServiceResult<Workspace> => {
    const occurredAt = nowIso()

    return transactional((params) => {
      const created = context.workspaceRepository.create({ ...input, executor: params.executor })
      if (!created.ok) {
        return created
      }

      const appendResult = params.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "workspace.changed",
          occurredAt,
          workspaceId: created.value.id,
          payload: { change: "created", state: created.value.state },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return { ok: true, value: created.value, appendedRecords: appendResult.value }
    })
  }

  const updateName = (
    input: UpdateWorkspaceNameInput,
  ): WorkspaceServiceResult<Workspace> => {
    const occurredAt = nowIso()

    return transactional((params) => {
      const updated = context.workspaceRepository.updateName({
        ...input,
        executor: params.executor,
      })
      if (!updated.ok) {
        return updated
      }

      const appendResult = params.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "workspace.changed",
          occurredAt,
          workspaceId: updated.value.id,
          payload: { change: "updated", state: updated.value.state },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return { ok: true, value: updated.value, appendedRecords: appendResult.value }
    })
  }

  const deleteWorkspace = (input: { id: string }): WorkspaceServiceResult<void> => {
    const occurredAt = nowIso()
    const workspaceId = input.id

    return transactional((params) => {
      context.eventJournal.deleteByWorkspace({
        workspaceId,
        executor: params.executor,
      })

      const deleted = context.workspaceRepository.delete({
        id: workspaceId,
        executor: params.executor,
      })
      if (!deleted.ok) {
        return deleted
      }

      const appendResult = params.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "workspace.changed",
          occurredAt,
          workspaceId,
          payload: { change: "deleted" },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return { ok: true, value: undefined, appendedRecords: appendResult.value }
    })
  }

  return {
    create,
    updateName,
    delete: deleteWorkspace,
  }
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>
