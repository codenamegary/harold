import { AgentId, DetectAgentPathResponseSchema } from "contracts/http/agent-settings"
import { parseAgentSettingsProblem } from "./parse.agent.settings.problem"

export type AgentPathDetectError = Error & {
  problem: Awaited<ReturnType<typeof parseAgentSettingsProblem>>
}

const createAgentPathDetectError = (
  problem: Awaited<ReturnType<typeof parseAgentSettingsProblem>>,
): AgentPathDetectError => {
  const error = new Error(problem.detail) as AgentPathDetectError
  error.name = "AgentPathDetectError"
  error.problem = problem
  return error
}

export const isAgentPathDetectError = (error: unknown): error is AgentPathDetectError =>
  error instanceof Error && error.name === "AgentPathDetectError"

export const detectAgentPath = async (agentId: AgentId) => {
  const response = await fetch(`/v1/settings/agents/${agentId}/detect-path`, {
    method: "POST",
  })

  if (!response.ok) {
    const problem = await parseAgentSettingsProblem(response)
    throw createAgentPathDetectError(problem)
  }

  const payload: unknown = await response.json()
  return DetectAgentPathResponseSchema.parse(payload)
}
