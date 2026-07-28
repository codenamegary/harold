import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
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

export const buildAgentPathNotFoundProblem = (
  detail = "Could not find an agent executable on PATH",
) =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Agent executable not found",
    status: 404,
    detail,
  })

export const buildAgentPathInvalidProblem = (_path: string) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Invalid agent executable path",
    status: 400,
    code: "validation.field.path.invalid",
    errors: [{ pointer: "#/path", code: "validation.field.path.invalid" }],
  })

export const buildAgentPathAutoDetectFailedProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Could not detect agent path automatically.",
    status: 400,
    code: "validation.field.path.auto_detect_failed",
    errors: [{ pointer: "#/path", code: "validation.field.path.auto_detect_failed" }],
  })
