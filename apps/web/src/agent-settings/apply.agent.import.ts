import {
  AgentSettingsCollectionSchema,
  ImportApplyBody,
} from "contracts/http/agent-settings"
import { parseAgentSettingsProblem } from "./parse.agent.settings.problem"

export type AgentImportApplyError = Error & {
  problem: Awaited<ReturnType<typeof parseAgentSettingsProblem>>
}

const createAgentImportApplyError = (
  problem: Awaited<ReturnType<typeof parseAgentSettingsProblem>>,
): AgentImportApplyError => {
  const error = new Error(problem.detail) as AgentImportApplyError
  error.name = "AgentImportApplyError"
  error.problem = problem
  return error
}

export const isAgentImportApplyError = (error: unknown): error is AgentImportApplyError =>
  error instanceof Error && error.name === "AgentImportApplyError"

export const applyAgentImport = async (body: ImportApplyBody) => {
  const response = await fetch("/v1/settings/agents/import/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const problem = await parseAgentSettingsProblem(response)
    throw createAgentImportApplyError(problem)
  }

  const payload: unknown = await response.json()
  return AgentSettingsCollectionSchema.parse(payload)
}
