import {
  CreateSessionBody,
  CreateSessionResponseSchema,
} from "contracts/http/session"
import {
  parseSessionProblem,
  SessionProblemDetails,
} from "./parse.session.problem"

export type SessionCreateError = Error & {
  problem: SessionProblemDetails
}

const createSessionCreateError = (
  problem: SessionProblemDetails,
): SessionCreateError => {
  const error = new Error(problem.detail) as SessionCreateError
  error.name = "SessionCreateError"
  error.problem = problem
  return error
}

export const isSessionCreateError = (error: unknown): error is SessionCreateError =>
  error instanceof Error && error.name === "SessionCreateError"

export const createSession = async (body: CreateSessionBody) => {
  const response = await fetch("/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createSessionCreateError(problem)
  }

  const payload: unknown = await response.json()
  return CreateSessionResponseSchema.parse(payload)
}
