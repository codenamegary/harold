import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"

export type SessionProblemDetails = {
  detail: string
}

export const parseSessionProblem = async (
  response: Response,
): Promise<SessionProblemDetails> => {
  const payload: unknown = await response.json()

  if (response.status === 400) {
    const problem = ValidationProblemSchema.parse(payload)
    return { detail: problem.title }
  }

  if (response.status === 404) {
    const problem = NotFoundProblemSchema.parse(payload)
    return { detail: problem.detail ?? problem.title }
  }

  if (response.status === 409) {
    const problem = ConflictProblemSchema.parse(payload)
    return { detail: problem.detail ?? problem.title }
  }

  return {
    detail: `Session request failed with ${response.status}`,
  }
}
