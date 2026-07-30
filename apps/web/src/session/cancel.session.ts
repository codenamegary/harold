import { CancelSessionResponseSchema } from "contracts/http/session"
import {
  parseSessionProblem,
  SessionProblemDetails,
} from "./parse.session.problem"

export type SessionCancelError = Error & {
  problem: SessionProblemDetails
}

const createSessionCancelError = (
  problem: SessionProblemDetails,
): SessionCancelError => {
  const error = new Error(problem.detail) as SessionCancelError
  error.name = "SessionCancelError"
  error.problem = problem
  return error
}

export const isSessionCancelError = (error: unknown): error is SessionCancelError =>
  error instanceof Error && error.name === "SessionCancelError"

export const cancelSession = async (sessionId: string) => {
  const response = await fetch(`/v1/sessions/${sessionId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createSessionCancelError(problem)
  }

  const payload: unknown = await response.json()
  return CancelSessionResponseSchema.parse(payload)
}
