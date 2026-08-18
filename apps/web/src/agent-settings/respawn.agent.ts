import {
  AgentId,
  AgentSettingsSchema,
} from "contracts/http/agent-settings"
import {
  AgentSettingsProblemDetails,
  parseAgentSettingsProblem,
} from "./parse.agent.settings.problem"

export type AgentRespawnError = Error & {
  problem: AgentSettingsProblemDetails
}

const createAgentRespawnError = (
  problem: AgentSettingsProblemDetails,
): AgentRespawnError => {
  const error = new Error(problem.detail) as AgentRespawnError
  error.name = "AgentRespawnError"
  error.problem = problem
  return error
}

export const isAgentRespawnError = (error: unknown): error is AgentRespawnError =>
  error instanceof Error && error.name === "AgentRespawnError"

export const respawnAgent = async (agentId: AgentId) => {
  const response = await fetch(`/v1/settings/agents/${agentId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "respawn" }),
  })

  if (!response.ok) {
    const problem = await parseAgentSettingsProblem(response)
    throw createAgentRespawnError(problem)
  }

  const payload: unknown = await response.json()
  return AgentSettingsSchema.parse(payload)
}
