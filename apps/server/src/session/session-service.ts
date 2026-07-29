import { AgentId } from "contracts/http/agent-settings"
import { JOURNAL_SCHEMA_VERSION } from "contracts/events/journal-record"
import { AgentDatabase } from "../persistence/open-database"
import { EventCommitPublisher } from "../event/event-commit-publisher"
import { EventJournalRepository } from "../event/event-journal-repository"
import { runTransactionalJournal, TransactionalJournalError } from "../event/transactional-journal"
import { Session } from "contracts/http/session"
import {
  ArchiveSessionInput,
  MarkSessionErrorInput,
  MarkSessionReadyInput,
  SessionRepository,
} from "./session-repository"
import { SessionRepositoryError } from "./session-errors"

export type SessionServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SessionRepositoryError | TransactionalJournalError }

type SessionServiceContext = {
  database: AgentDatabase
  sessionRepository: SessionRepository
  eventJournal: EventJournalRepository
  commitPublisher: EventCommitPublisher
}

const nowIso = (): string => new Date().toISOString()

export const createSessionService = (context: SessionServiceContext) => {
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

  const createStarting = (input: {
    workspaceId: string
    agentId: AgentId
    name: string
  }): SessionServiceResult<Session> => {
    const occurredAt = nowIso()

    return transactional((params) => {
      const created = context.sessionRepository.create({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        name: input.name,
        acpSessionId: "pending",
        state: "starting",
        executor: params.executor,
      })
      if (!created.ok) {
        return created
      }

      const appendResult = params.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "session.created",
          occurredAt,
          workspaceId: created.value.workspaceId,
          sessionId: created.value.id,
          payload: { name: created.value.name },
        },
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "session.state",
          occurredAt,
          workspaceId: created.value.workspaceId,
          sessionId: created.value.id,
          payload: { state: "starting" },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return { ok: true, value: created.value }
    })
  }

  const markReady = (
    input: MarkSessionReadyInput,
  ): SessionServiceResult<Session> => {
    const occurredAt = nowIso()

    return transactional((params) => {
      const ready = context.sessionRepository.markReady({
        ...input,
        executor: params.executor,
      })
      if (!ready.ok) {
        return ready
      }

      const appendResult = params.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "session.state",
          occurredAt,
          workspaceId: ready.value.workspaceId,
          sessionId: ready.value.id,
          payload: { state: "idle" },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return { ok: true, value: ready.value }
    })
  }

  const markError = (
    input: MarkSessionErrorInput,
  ): SessionServiceResult<Session> => {
    const occurredAt = nowIso()

    return transactional((params) => {
      const errored = context.sessionRepository.markError({
        ...input,
        executor: params.executor,
      })
      if (!errored.ok) {
        return errored
      }

      const appendResult = params.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "session.state",
          occurredAt,
          workspaceId: errored.value.workspaceId,
          sessionId: errored.value.id,
          payload: { state: "error" },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return { ok: true, value: errored.value }
    })
  }

  const archive = (
    input: ArchiveSessionInput,
  ): SessionServiceResult<Session> => {
    const occurredAt = nowIso()

    return transactional((params) => {
      const archived = context.sessionRepository.archive({
        ...input,
        executor: params.executor,
      })
      if (!archived.ok) {
        return archived
      }

      const appendResult = params.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "session.state",
          occurredAt,
          workspaceId: archived.value.workspaceId,
          sessionId: archived.value.id,
          payload: { state: "archived" },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return { ok: true, value: archived.value }
    })
  }

  const resume = (
    input: MarkSessionReadyInput,
  ): SessionServiceResult<Session> => markReady(input)

  return {
    createStarting,
    markReady,
    markError,
    archive,
    resume,
  }
}

export type SessionService = ReturnType<typeof createSessionService>
