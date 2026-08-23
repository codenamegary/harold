import {
  AgentAuth,
  AgentAuthSchema,
  AgentAuthSession,
  AgentAuthSessionSchema,
  AgentAuthSummary,
  AgentAuthSummarySchema,
  agentAuthLogoutPath,
  agentAuthPath,
  agentAuthSessionActionsPath,
  agentAuthSessionsPath,
  AuthSessionAction,
} from "contracts/http/agent-auth"
import { AgentId } from "contracts/http/agent-settings"
import { ConflictProblemSchema, NotFoundProblemSchema } from "contracts/http/error"

export type AgentAuthRequestError = Error & {
  status: number
  detail: string
}

export const createAgentAuthRequestError = (
  status: number,
  detail: string,
): AgentAuthRequestError => {
  const error = new Error(detail) as AgentAuthRequestError
  error.name = "AgentAuthRequestError"
  error.status = status
  error.detail = detail
  return error
}

export const isAgentAuthRequestError = (error: unknown): error is AgentAuthRequestError =>
  error instanceof Error && error.name === "AgentAuthRequestError"

const detailFromProblem = async (response: Response): Promise<string> => {
  const payload: unknown = await response.json()

  if (response.status === 404) {
    const problem = NotFoundProblemSchema.parse(payload)
    return problem.detail ?? problem.title
  }

  if (response.status === 409) {
    const problem = ConflictProblemSchema.parse(payload)
    return problem.detail ?? problem.title
  }

  return `Agent auth request failed with ${response.status}`
}

const throwIfNotOk = async (response: Response): Promise<void> => {
  if (response.ok) {
    return
  }
  throw createAgentAuthRequestError(response.status, await detailFromProblem(response))
}

export const fetchAgentAuth = async (agentId: AgentId): Promise<AgentAuth> => {
  const response = await fetch(agentAuthPath(agentId))
  await throwIfNotOk(response)
  const payload: unknown = await response.json()
  return AgentAuthSchema.parse(payload)
}

export const startAgentAuthSession = async (
  agentId: AgentId,
): Promise<AgentAuthSession> => {
  const response = await fetch(agentAuthSessionsPath(agentId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  await throwIfNotOk(response)
  const payload: unknown = await response.json()
  return AgentAuthSessionSchema.parse(payload)
}

export const applyAgentAuthSessionAction = async (input: {
  agentId: AgentId
  sessionId: string
  action: AuthSessionAction
}): Promise<AgentAuthSession> => {
  const response = await fetch(
    agentAuthSessionActionsPath(input.agentId, input.sessionId),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.action),
    },
  )
  await throwIfNotOk(response)
  const payload: unknown = await response.json()
  return AgentAuthSessionSchema.parse(payload)
}

export const logoutAgentAuth = async (agentId: AgentId): Promise<AgentAuthSummary> => {
  const response = await fetch(agentAuthLogoutPath(agentId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  await throwIfNotOk(response)
  const payload: unknown = await response.json()
  return AgentAuthSummarySchema.parse(payload)
}
