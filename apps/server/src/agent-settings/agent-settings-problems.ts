import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
} from "contracts/http/error"

export const buildAgentNotFoundProblem = (detail = "Unknown agent id") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Agent not found",
    status: 404,
    detail,
  })

export const buildAgentCannotEnableProblem = (detail = "Agent is not available in this release") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Agent cannot be enabled",
    status: 409,
    detail,
  })
