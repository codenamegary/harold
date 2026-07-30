import { SessionSchema } from "contracts/http/session"
import {
  parseSessionProblem,
  SessionProblemDetails,
} from "./parse.session.problem"

export type SessionSelectError = Error & {
  problem: SessionProblemDetails
}

const createSessionSelectError = (
  problem: SessionProblemDetails,
): SessionSelectError => {
  const error = new Error(problem.detail) as SessionSelectError
  error.name = "SessionSelectError"
  error.problem = problem
  return error
}

export const isSessionSelectError = (error: unknown): error is SessionSelectError =>
  error instanceof Error && error.name === "SessionSelectError"

export const selectSession = async (sessionId: string) => {
  const response = await fetch(`/v1/sessions/${sessionId}/select`, {
    method: "POST",
  })

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createSessionSelectError(problem)
  }

  const payload: unknown = await response.json()
  return SessionSchema.parse(payload)
}
