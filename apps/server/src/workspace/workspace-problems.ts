import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
  WorkspaceActiveSessionsProblemSchema,
} from "contracts/http/error"
import { sanitizeAcpErrorMessage } from "../acp/sanitize-acp-error"
import { WorkspacePathError } from "./workspace-errors"

const pathErrorCodes: Record<WorkspacePathError["kind"], string> = {
  missing: "validation.field.path.missing",
  not_directory: "validation.field.path.not_directory",
  unreadable: "validation.field.path.unreadable",
}

export const buildPathValidationProblem = (error: WorkspacePathError) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/path", code: pathErrorCodes[error.kind] }],
  })

export const buildNotFoundProblem = (detail = "Unknown workspace id") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Workspace not found",
    status: 404,
    detail,
  })

export const buildConflictProblem = (detail = "Duplicate canonical path") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Workspace path already registered",
    status: 409,
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

export const buildWorkspaceActiveSessionsProblem = (
  detail = "Workspace has active sessions that could not be closed",
) =>
  WorkspaceActiveSessionsProblemSchema.parse({
    type: PROBLEM_TYPES.workspaceActiveSessions,
    title: "Workspace has active sessions",
    status: 409,
    detail: sanitizeAcpErrorMessage(detail),
    forceDeleteAvailable: true,
  })

export const buildOutsideAllowedRootProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/path", code: "validation.field.path.outside_allowed_root" }],
  })
