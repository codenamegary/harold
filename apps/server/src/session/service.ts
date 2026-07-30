import { AgentId } from "contracts/http/agent-settings"
import { JOURNAL_SCHEMA_VERSION } from "contracts/events/journal-record"
import { AgentDatabase } from "../persistence/database"
import { EventCommitPublisher } from "../event/commit.publisher"
import { EventJournalRepository } from "../event/journal.repository"
import { runTransactionalJournal, TransactionalJournalError } from "../event/journal.transactional"
import { Session } from "contracts/http/session"
import {
  ArchiveSessionInput,
  MarkSessionErrorInput,
  MarkSessionReadyInput,
  SessionRepository,
  SetSessionStateInput,
} from "./repository"
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

      return { ok: true, value: created.value, appendedRecords: appendResult.value }
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

      return { ok: true, value: ready.value, appendedRecords: appendResult.value }
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

      return { ok: true, value: errored.value, appendedRecords: appendResult.value }
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

      return { ok: true, value: archived.value, appendedRecords: appendResult.value }
    })
  }

  const resume = (
    input: MarkSessionReadyInput,
  ): SessionServiceResult<Session> => markReady(input)

  const setTurnState = (
    input: SetSessionStateInput,
  ): SessionServiceResult<Session> => {
    const occurredAt = nowIso()

    return transactional((params) => {
      const updated = context.sessionRepository.setState({
        ...input,
        executor: params.executor,
      })
      if (!updated.ok) {
        return updated
      }

      const appendResult = params.append([
        {
          schemaVersion: JOURNAL_SCHEMA_VERSION,
          kind: "session.state",
          occurredAt,
          workspaceId: updated.value.workspaceId,
          sessionId: updated.value.id,
          payload: { state: input.state },
        },
      ])

      if (!appendResult.ok) {
        return appendResult
      }

      return { ok: true, value: updated.value, appendedRecords: appendResult.value }
    })
  }

  const markRunning = (
    input: { id: string },
  ): SessionServiceResult<Session> => setTurnState({ id: input.id, state: "running" })

  const markIdle = (
    input: { id: string },
  ): SessionServiceResult<Session> => setTurnState({ id: input.id, state: "idle" })

  return {
    createStarting,
    markReady,
    markError,
    archive,
    resume,
    markRunning,
    markIdle,
  }
}

export type SessionService = ReturnType<typeof createSessionService>
