import { SessionSchema } from "contracts/http/session"
import {
  parseSessionProblem,
  SessionProblemDetails,
} from "./parse.session.problem"

export type SessionArchiveError = Error & {
  problem: SessionProblemDetails
}

const createSessionArchiveError = (
  problem: SessionProblemDetails,
): SessionArchiveError => {
  const error = new Error(problem.detail) as SessionArchiveError
  error.name = "SessionArchiveError"
  error.problem = problem
  return error
}

export const isSessionArchiveError = (error: unknown): error is SessionArchiveError =>
  error instanceof Error && error.name === "SessionArchiveError"

export const archiveSession = async (sessionId: string) => {
  const response = await fetch(`/v1/sessions/${sessionId}/archive`, {
    method: "POST",
  })

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createSessionArchiveError(problem)
  }

  const payload: unknown = await response.json()
  return SessionSchema.parse(payload)
}
