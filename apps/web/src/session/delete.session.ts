import { AgentId } from "contracts/http/agent-settings"
import {
  SessionDeleteTarget,
  deleteSessionPath,
} from "contracts/http/session"
import { mapWithConcurrency } from "./map.with.concurrency"
import {
  parseSessionProblem,
  SessionProblemDetails,
} from "./parse.session.problem"

export type SessionDeleteError = Error & {
  problem: SessionProblemDetails
}

export type DeleteSessionsFailedItem = SessionDeleteTarget & {
  reason: string
}

export type DeleteSessionsResult = {
  deleted: ReadonlyArray<SessionDeleteTarget>
  failed: ReadonlyArray<DeleteSessionsFailedItem>
}

export type DeleteSessionsSettledEvent = {
  done: number
  total: number
  item: SessionDeleteTarget
  ok: boolean
  error?: SessionDeleteError
}

export type DeleteSessionsOptions = {
  concurrency?: number
  onSettled?: (event: DeleteSessionsSettledEvent) => void
}

const DEFAULT_DELETE_CONCURRENCY = 10

const createSessionDeleteError = (
  problem: SessionProblemDetails,
): SessionDeleteError => {
  const error = new Error(problem.detail) as SessionDeleteError
  error.name = "SessionDeleteError"
  error.problem = problem
  return error
}

export const isSessionDeleteError = (
  error: unknown,
): error is SessionDeleteError =>
  error instanceof Error && error.name === "SessionDeleteError"

export const deleteSession = async (params: {
  agentId: AgentId
  sessionId: string
}): Promise<void> => {
  const response = await fetch(
    deleteSessionPath(params.sessionId, { agentId: params.agentId }),
    { method: "DELETE" },
  )

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createSessionDeleteError(problem)
  }
}

export const deleteSessions = async (
  items: ReadonlyArray<SessionDeleteTarget>,
  options: DeleteSessionsOptions = {},
): Promise<DeleteSessionsResult> => {
  const total = items.length
  const concurrency = options.concurrency ?? DEFAULT_DELETE_CONCURRENCY
  const progress = { done: 0 }

  const outcomes = await mapWithConcurrency(items, concurrency, async (item) => {
    try {
      await deleteSession(item)
      progress.done += 1
      options.onSettled?.({
        done: progress.done,
        total,
        item,
        ok: true,
      })
      return { ok: true as const, item }
    } catch (error) {
      const sessionError = isSessionDeleteError(error)
        ? error
        : createSessionDeleteError({
            detail:
              error instanceof Error ? error.message : "Delete failed",
          })
      progress.done += 1
      options.onSettled?.({
        done: progress.done,
        total,
        item,
        ok: false,
        error: sessionError,
      })
      return {
        ok: false as const,
        item,
        reason: sessionError.problem.detail,
      }
    }
  })

  return {
    deleted: outcomes.flatMap((outcome) =>
      outcome.ok ? [outcome.item] : [],
    ),
    failed: outcomes.flatMap((outcome) =>
      outcome.ok
        ? []
        : [{ ...outcome.item, reason: outcome.reason }],
    ),
  }
}
