import { AgentId } from "contracts/http/agent-settings"
import {
  BulkDeleteSessionsBodySchema,
  BulkDeleteSessionsResponseSchema,
  BulkDeleteSessionsResponse,
  SessionDeleteTarget,
  SESSIONS_PATH,
} from "contracts/http/session"
import {
  parseSessionProblem,
  SessionProblemDetails,
} from "./parse.session.problem"

export type SessionDeleteError = Error & {
  problem: SessionProblemDetails
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

export const deleteSessions = async (
  items: ReadonlyArray<SessionDeleteTarget>,
): Promise<BulkDeleteSessionsResponse> => {
  const body = BulkDeleteSessionsBodySchema.parse({ items })
  const response = await fetch(SESSIONS_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createSessionDeleteError(problem)
  }

  return BulkDeleteSessionsResponseSchema.parse(await response.json())
}

export const deleteSession = async (params: {
  agentId: AgentId
  sessionId: string
}) => {
  const result = await deleteSessions([params])
  const failure = result.failed[0]
  if (failure !== undefined) {
    throw createSessionDeleteError({
      detail: failure.reason,
    })
  }
}
