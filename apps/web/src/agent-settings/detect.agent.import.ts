import { ImportDetectResponseSchema } from "contracts/http/agent-settings"
import { parseAgentSettingsProblem } from "./parse.agent.settings.problem"

export type AgentImportDetectError = Error & {
  problem: Awaited<ReturnType<typeof parseAgentSettingsProblem>>
}

const createAgentImportDetectError = (
  problem: Awaited<ReturnType<typeof parseAgentSettingsProblem>>,
): AgentImportDetectError => {
  const error = new Error(problem.detail) as AgentImportDetectError
  error.name = "AgentImportDetectError"
  error.problem = problem
  return error
}

export const isAgentImportDetectError = (error: unknown): error is AgentImportDetectError =>
  error instanceof Error && error.name === "AgentImportDetectError"

export const detectAgentImport = async () => {
  const response = await fetch("/v1/settings/agents/import/detect", {
    method: "POST",
  })

  if (!response.ok) {
    const problem = await parseAgentSettingsProblem(response)
    throw createAgentImportDetectError(problem)
  }

  const payload: unknown = await response.json()
  return ImportDetectResponseSchema.parse(payload)
}
