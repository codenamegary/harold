import { AgentId } from "contracts/http/agent-settings"
import {
  AgentSettingsProblemDetails,
  parseAgentSettingsProblem,
} from "./parse.agent.settings.problem"

export type DeleteAgentSettingsError = Error & {
  problem: AgentSettingsProblemDetails
}

const createDeleteAgentSettingsError = (
  problem: AgentSettingsProblemDetails,
): DeleteAgentSettingsError => {
  const error = new Error(problem.detail) as DeleteAgentSettingsError
  error.name = "DeleteAgentSettingsError"
  error.problem = problem
  return error
}

export const isDeleteAgentSettingsError = (
  error: unknown,
): error is DeleteAgentSettingsError =>
  error instanceof Error && error.name === "DeleteAgentSettingsError"

export const deleteAgentSettings = async (agentId: AgentId) => {
  const response = await fetch(`/v1/settings/agents/${agentId}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    const problem = await parseAgentSettingsProblem(response)
    throw createDeleteAgentSettingsError(problem)
  }
}
