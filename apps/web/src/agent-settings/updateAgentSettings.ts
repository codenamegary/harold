import {
  AgentId,
  AgentSettingsSchema,
  UpdateAgentSettingsBody,
} from "contracts/http/agent-settings"
import {
  AgentSettingsProblemDetails,
  parseAgentSettingsProblem,
} from "./parseAgentSettingsProblem"

export type AgentSettingsUpdateError = Error & {
  problem: AgentSettingsProblemDetails
}

const createAgentSettingsUpdateError = (
  problem: AgentSettingsProblemDetails,
): AgentSettingsUpdateError => {
  const error = new Error(problem.detail) as AgentSettingsUpdateError
  error.name = "AgentSettingsUpdateError"
  error.problem = problem
  return error
}

export const isAgentSettingsUpdateError = (
  error: unknown,
): error is AgentSettingsUpdateError =>
  error instanceof Error && error.name === "AgentSettingsUpdateError"

export const updateAgentSettings = async (input: {
  agentId: AgentId
  body: UpdateAgentSettingsBody
}) => {
  const response = await fetch(`/v1/settings/agents/${input.agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  })

  if (!response.ok) {
    const problem = await parseAgentSettingsProblem(response)
    throw createAgentSettingsUpdateError(problem)
  }

  const payload: unknown = await response.json()
  return AgentSettingsSchema.parse(payload)
}
