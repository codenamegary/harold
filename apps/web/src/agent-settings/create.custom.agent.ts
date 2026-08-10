import { AgentSettingsSchema } from "contracts/http/agent-settings"
import {
  AgentSettingsProblemDetails,
  parseAgentSettingsProblem,
} from "./parse.agent.settings.problem"

export type CreateCustomAgentError = Error & {
  problem: AgentSettingsProblemDetails
}

const createCreateCustomAgentError = (
  problem: AgentSettingsProblemDetails,
): CreateCustomAgentError => {
  const error = new Error(problem.detail) as CreateCustomAgentError
  error.name = "CreateCustomAgentError"
  error.problem = problem
  return error
}

export const isCreateCustomAgentError = (error: unknown): error is CreateCustomAgentError =>
  error instanceof Error && error.name === "CreateCustomAgentError"

export const createCustomAgent = async () => {
  const response = await fetch("/v1/settings/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const problem = await parseAgentSettingsProblem(response)
    throw createCreateCustomAgentError(problem)
  }

  const payload: unknown = await response.json()
  return AgentSettingsSchema.parse(payload)
}
