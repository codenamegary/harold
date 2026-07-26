import {
  ConflictProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"

export type WorkspaceProblemDetails = {
  detail: string
  fieldError?: string
}

export const parseWorkspaceProblem = async (
  response: Response,
): Promise<WorkspaceProblemDetails> => {
  const payload: unknown = await response.json()

  if (response.status === 400) {
    const problem = ValidationProblemSchema.parse(payload)
    const firstError = problem.errors[0]

    return {
      detail: problem.title,
      fieldError: firstError
        ? `${firstError.pointer}: ${firstError.code}`
        : undefined,
    }
  }

  if (response.status === 409) {
    const problem = ConflictProblemSchema.parse(payload)

    return {
      detail: problem.detail ?? problem.title,
    }
  }

  return {
    detail: `Workspace request failed with ${response.status}`,
  }
}
