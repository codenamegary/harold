import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  UnprocessableProblemSchema,
  ValidationProblemSchema,
  WorkspaceActiveSessionsProblemSchema,
} from "contracts/http/error"
import { sanitizeAcpErrorMessage } from "../acp/sanitize.error"
import { FilesystemPathError } from "core/filesystem/errors"

const pathErrorCodes: Record<FilesystemPathError["kind"], string> = {
  missing: "validation.field.path.missing",
  not_directory: "validation.field.path.not_directory",
  unreadable: "validation.field.path.unreadable",
}

export const buildPathValidationProblem = (error: FilesystemPathError) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/path", code: pathErrorCodes[error.kind] }],
  })

export const buildInvalidGitUrlProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/url", code: "validation.field.url.invalid" }],
  })

export const buildNotFoundProblem = (detail = "Unknown workspace id") =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Workspace not found",
    status: 404,
    detail,
  })

export const buildDestinationNotEmptyProblem = () =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Workspace destination is not empty",
    status: 409,
    detail: "Clone into an empty folder",
  })

export const buildWorkspaceConflictProblem = (detail = "Workspace could not be registered") =>
  ConflictProblemSchema.parse({
    type: PROBLEM_TYPES.conflict,
    title: "Workspace could not be registered",
    status: 409,
    detail,
  })

export const buildCloneFailedProblem = (detail: string) =>
  UnprocessableProblemSchema.parse({
    type: PROBLEM_TYPES.unprocessable,
    title: "Git clone failed",
    status: 422,
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
