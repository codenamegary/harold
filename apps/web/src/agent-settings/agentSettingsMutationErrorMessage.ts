import { isAgentPathDetectError } from "./detectAgentPath"
import { isAgentSettingsUpdateError } from "./updateAgentSettings"

export const agentSettingsUpdateErrorMessage = (error: unknown, fallback: string) => {
  if (isAgentSettingsUpdateError(error)) {
    return error.problem.pathError ?? error.problem.detail
  }

  return fallback
}

export const agentPathDetectErrorMessage = (error: unknown, fallback: string) => {
  if (isAgentPathDetectError(error)) {
    return error.problem.detail
  }

  return fallback
}
