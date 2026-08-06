import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"
import { sanitizeAcpErrorMessage } from "../acp/sanitize-acp-error"

export const buildWorkspaceNotFoundProblem = (detail = "Unknown workspace id") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Workspace not found",
    status: 404,
    detail,
  })

export const buildAgentNotFoundProblem = (detail = "Unknown agent id") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Agent not found",
    status: 404,
    detail,
  })

export const buildAgentUnavailableProblem = (detail = "Agent is not available in this release") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Agent is not available",
    status: 409,
    detail,
  })

export const buildAgentDisabledProblem = (detail = "Agent is not enabled") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Agent is disabled",
    status: 409,
    detail,
  })

export const buildSessionNotFoundProblem = (detail = "Unknown session id") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Session not found",
    status: 404,
    detail,
  })

export const buildInvalidCursorProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/cursor", code: "validation.query.cursor.invalid" }],
  })

export const buildSessionArchivedProblem = (detail = "Session is archived") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Session is archived",
    status: 409,
    detail,
  })

export const buildSessionNotResumableProblem = (detail = "Session cannot be resumed") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Session is not resumable",
    status: 409,
    detail: sanitizeAcpErrorMessage(detail),
  })

export const buildAcpUnavailableProblem = (detail = "ACP agent is unavailable") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "ACP unavailable",
    status: 409,
    detail: sanitizeAcpErrorMessage(detail),
  })

export const buildTurnInProgressProblem = (
  detail = "A turn is already running for this session",
) =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Turn already in progress",
    status: 409,
    detail,
  })

export const buildNoActiveTurnProblem = (detail = "No turn in progress") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "No turn in progress",
    status: 409,
    detail,
  })

export const buildPermissionNotFoundProblem = (detail = "Unknown permission request") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Permission request not found",
    status: 404,
    detail,
  })

export const buildPermissionConflictProblem = (detail = "Permission request already resolved") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Permission request conflict",
    status: 409,
    detail,
  })

export const buildPermissionValidationProblem = (detail: string) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/optionId", code: "validation.permission.option.invalid" }],
    detail,
  })
