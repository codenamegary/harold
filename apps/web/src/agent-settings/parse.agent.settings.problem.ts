import {
  ConflictProblemSchema,
  InternalProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"

export type AgentSettingsProblemDetails = {
  detail: string
  pathError?: string
}

const pathErrorFromValidation = (problem: ReturnType<typeof ValidationProblemSchema.parse>) => {
  const pathFieldError = problem.errors.find((error) => error.pointer === "#/path")
  return pathFieldError?.code === "validation.field.path.auto_detect_failed" ||
    pathFieldError?.code === "validation.field.path.invalid"
    ? problem.title
    : undefined
}

export const parseAgentSettingsProblem = async (
  response: Response,
): Promise<AgentSettingsProblemDetails> => {
  const payload: unknown = await response.json()

  if (response.status === 400) {
    const problem = ValidationProblemSchema.parse(payload)

    return {
      detail: problem.title,
      pathError: pathErrorFromValidation(problem),
    }
  }

  if (response.status === 404) {
    const problem = NotFoundProblemSchema.parse(payload)

    return {
      detail: problem.detail ?? problem.title,
    }
  }

  if (response.status === 409) {
    const problem = ConflictProblemSchema.parse(payload)

    return {
      detail: problem.detail ?? problem.title,
    }
  }

  if (response.status === 502) {
    const problem = InternalProblemSchema.parse(payload)

    return {
      detail: problem.detail ?? problem.title,
    }
  }

  return {
    detail: `Agent settings request failed with ${response.status}`,
  }
}
