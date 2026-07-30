import {
  PromptSessionBody,
  PromptSessionResponseSchema,
} from "contracts/http/session"
import {
  parseSessionProblem,
  SessionProblemDetails,
} from "./parse.session.problem"

export type SessionPromptError = Error & {
  problem: SessionProblemDetails
}

const createSessionPromptError = (
  problem: SessionProblemDetails,
): SessionPromptError => {
  const error = new Error(problem.detail) as SessionPromptError
  error.name = "SessionPromptError"
  error.problem = problem
  return error
}

export const isSessionPromptError = (error: unknown): error is SessionPromptError =>
  error instanceof Error && error.name === "SessionPromptError"

export type PromptSessionParams = {
  sessionId: string
  body: PromptSessionBody
}

export const promptSession = async (params: PromptSessionParams) => {
  const response = await fetch(`/v1/sessions/${params.sessionId}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params.body),
  })

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createSessionPromptError(problem)
  }

  const payload: unknown = await response.json()
  return PromptSessionResponseSchema.parse(payload)
}
