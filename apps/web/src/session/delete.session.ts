import { AgentId } from "contracts/http/agent-settings"
import {
  SessionDeleteTarget,
  deleteSessionPath,
} from "contracts/http/session"
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
  signal?: AbortSignal
  onSettled?: (event: DeleteSessionsSettledEvent) => void
}

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

const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && error.name === "AbortError")

export const deleteSession = async (params: {
  agentId: AgentId
  sessionId: string
  signal?: AbortSignal
}): Promise<void> => {
  const response = await fetch(
    deleteSessionPath(params.sessionId, { agentId: params.agentId }),
    { method: "DELETE", signal: params.signal },
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
  const deleted: SessionDeleteTarget[] = []
  const failed: DeleteSessionsFailedItem[] = []
  const progress = { done: 0 }

  for (const item of items) {
    if (options.signal?.aborted) {
      break
    }

    try {
      await deleteSession({ ...item, signal: options.signal })
      progress.done += 1
      deleted.push(item)
      options.onSettled?.({
        done: progress.done,
        total,
        item,
        ok: true,
      })
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) {
        break
      }

      const sessionError = isSessionDeleteError(error)
        ? error
        : createSessionDeleteError({
            detail:
              error instanceof Error ? error.message : "Delete failed",
          })
      progress.done += 1
      failed.push({ ...item, reason: sessionError.problem.detail })
      options.onSettled?.({
        done: progress.done,
        total,
        item,
        ok: false,
        error: sessionError,
      })
    }
  }

  return { deleted, failed }
}
