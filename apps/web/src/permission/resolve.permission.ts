import {
  ResolvePermissionRequestBody,
  ResolvePermissionRequestResponseSchema,
} from "contracts/http/permission"
import { parseSessionProblem, SessionProblemDetails } from "../session/parse.session.problem"

export type ResolvePermissionError = Error & {
  problem: SessionProblemDetails
}

const createResolvePermissionError = (
  problem: SessionProblemDetails,
): ResolvePermissionError => {
  const error = new Error(problem.detail) as ResolvePermissionError
  error.name = "ResolvePermissionError"
  error.problem = problem
  return error
}

export type ResolvePermissionParams = {
  sessionId: string
  requestId: string
  body: ResolvePermissionRequestBody
}

export const resolvePermission = async (params: ResolvePermissionParams) => {
  const response = await fetch(
    `/v1/sessions/${params.sessionId}/permissions/${params.requestId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.body),
    },
  )

  if (!response.ok) {
    const problem = await parseSessionProblem(response)
    throw createResolvePermissionError(problem)
  }

  const payload: unknown = await response.json()
  return ResolvePermissionRequestResponseSchema.parse(payload)
}
