import { AgentId } from "contracts/http/agent-settings"
import { deleteSessionPath } from "contracts/http/session"
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

export const deleteSession = async (params: {
  agentId: AgentId
  sessionId: string
}) => {
  const response = await fetch(deleteSessionPath(params.sessionId, {
    agentId: params.agentId,
  }), {
    method: "DELETE",
  })

  if (response.status === 204) {
    return
  }

  const problem = await parseSessionProblem(response)
  throw createSessionDeleteError(problem)
}
