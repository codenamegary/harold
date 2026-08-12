import {
  ConflictProblemSchema,
  InternalProblemSchema,
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

export const buildAgentCannotEnableProblem = (
  detail = "Agent is not available in this release",
) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Agent cannot be enabled",
    status: 409,
    detail,
  })

export const buildAgentSessionListUnsupportedProblem = () =>
  buildAgentCannotEnableProblem(
    "Agent does not advertise sessionCapabilities.list and cannot join the session gateway",
  )

export const buildAgentCannotRenameProblem = (
  detail = "Only custom agents can be renamed",
) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Agent cannot be renamed",
    status: 409,
    detail,
  })

export const buildAgentCannotDeleteProblem = (
  detail = "Catalog agents cannot be deleted",
) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Agent cannot be deleted",
    status: 409,
    detail,
  })

export const buildAgentIdConflictProblem = (
  detail = "Another agent already uses this id",
) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Agent id conflict",
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

export const buildAgentRegistryFetchFailedProblem = (
  detail = "Could not fetch the live ACP registry",
) =>
  InternalProblemSchema.parse({
    type: PROBLEM_TYPES.internalError,
    title: "ACP registry unavailable",
    status: 502,
    detail,
  })
