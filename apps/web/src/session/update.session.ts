import { SessionSchema, UpdateSessionBody } from "contracts/http/session"
import {
  parseSessionProblem,
  SessionProblemDetails,
} from "./parse.session.problem"

export type SessionUpdateError = Error & {
  problem: SessionProblemDetails
}

const createSessionUpdateError = (
  problem: SessionProblemDetails,
): SessionUpdateError => {
  const error = new Error(problem.detail) as SessionUpdateError
  error.name = "SessionUpdateError"
  error.problem = problem
  return error
}

export const isSessionUpdateError = (error: unknown): error is SessionUpdateError =>
  error instanceof Error && error.name === "SessionUpdateError"

export const updateSession = async (sessionId: string, body: UpdateSessionBody) => {
  const response = await fetch(`/v1/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createSessionUpdateError(problem)
  }

  const payload: unknown = await response.json()
  return SessionSchema.parse(payload)
}
