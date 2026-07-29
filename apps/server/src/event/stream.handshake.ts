import { EventStreamQuerySchema } from "contracts/events/stream"
import { NotFoundProblem, ValidationProblem } from "contracts/http/error"
import { ZodError } from "zod"
import { SessionRepository } from "../session/repository"
import { WorkspaceRepository } from "../workspace/repository"
import { isUnsafeEventCursor, parseEventCursor } from "./cursor"
import { EventJournalRepository } from "./journal.repository"
import {
  buildEventStreamFutureCursorProblem,
  buildEventStreamInvalidCursorProblem,
  buildEventStreamSessionNotFoundProblem,
  buildEventStreamUnsafeCursorProblem,
  buildEventStreamWorkspaceNotFoundProblem,
} from "./stream.problems"

export type EventStreamFilters = {
  workspaceId?: string
  sessionId?: string
}

export type ValidatedEventStreamHandshake =
  | { mode: "live-only"; filters: EventStreamFilters }
  | { mode: "replay"; replayCursor: bigint; filters: EventStreamFilters }

export type EventStreamHandshakeResult =
  | { ok: true; handshake: ValidatedEventStreamHandshake }
  | { ok: false; status: 400; problem: ValidationProblem }
  | { ok: false; status: 404; problem: NotFoundProblem }

type ValidateEventStreamHandshakeParams = {
  query: unknown
  eventJournal: EventJournalRepository
  workspaceRepository: WorkspaceRepository
  sessionRepository: SessionRepository
}

const buildFilters = (workspaceId?: string, sessionId?: string): EventStreamFilters => ({
  ...(workspaceId !== undefined ? { workspaceId } : {}),
  ...(sessionId !== undefined ? { sessionId } : {}),
})

export const validateEventStreamHandshake = (
  params: ValidateEventStreamHandshakeParams,
): EventStreamHandshakeResult => {
  const parsedQuery = (() => {
    try {
      return EventStreamQuerySchema.parse(params.query)
    } catch (error: unknown) {
      if (
        error instanceof ZodError &&
        error.issues.some((issue) => issue.path[0] === "cursor")
      ) {
        return undefined
      }

      throw error
    }
  })()

  if (parsedQuery === undefined) {
    return {
      ok: false,
      status: 400,
      problem: buildEventStreamInvalidCursorProblem(),
    }
  }

  const { cursor, workspaceId, sessionId } = parsedQuery
  const filters = buildFilters(workspaceId, sessionId)

  if (workspaceId !== undefined) {
    const workspace = params.workspaceRepository.getById({ id: workspaceId })
    if (!workspace.ok) {
      return {
        ok: false,
        status: 404,
        problem: buildEventStreamWorkspaceNotFoundProblem(),
      }
    }
  }

  if (sessionId !== undefined) {
    const session = params.sessionRepository.getById({ id: sessionId })
    if (!session.ok) {
      return {
        ok: false,
        status: 404,
        problem: buildEventStreamSessionNotFoundProblem(),
      }
    }

    if (workspaceId !== undefined && session.value.workspaceId !== workspaceId) {
      return {
        ok: false,
        status: 404,
        problem: buildEventStreamSessionNotFoundProblem(),
      }
    }
  }

  if (cursor === undefined) {
    return { ok: true, handshake: { mode: "live-only", filters } }
  }

  const replayCursor = parseEventCursor(cursor)
  if (replayCursor === undefined) {
    return {
      ok: false,
      status: 400,
      problem: buildEventStreamInvalidCursorProblem(),
    }
  }

  if (isUnsafeEventCursor(replayCursor)) {
    return {
      ok: false,
      status: 400,
      problem: buildEventStreamUnsafeCursorProblem(),
    }
  }

  const highWaterCursor = params.eventJournal.getHighWaterCursor()
  if (replayCursor > highWaterCursor) {
    return {
      ok: false,
      status: 400,
      problem: buildEventStreamFutureCursorProblem(),
    }
  }

  return {
    ok: true,
    handshake: { mode: "replay", replayCursor, filters },
  }
}
