import {
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  UnprocessableProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { FilesystemPathError } from "core/filesystem/errors"
import { GitOperationError } from "core/git/errors"

const pathErrorCodes: Record<FilesystemPathError["kind"], string> = {
  missing: "validation.field.path.missing",
  not_directory: "validation.field.path.not_directory",
  unreadable: "validation.field.path.unreadable",
}

const buildValidationProblem = (pointer: string, code: string) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer, code }],
  })

export const buildGitPathValidationProblem = (error: FilesystemPathError) =>
  buildValidationProblem("#/path", pathErrorCodes[error.kind])

export const buildInvalidGitPathProblem = (pointer: "#/file" | "#/oldPath") =>
  buildValidationProblem(pointer, "validation.field.path.invalid")
export const buildNotGitRepositoryProblem = () =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Not a git repository",
    status: 404,
    detail: "Not a git repository",
  })

export const buildGitNotFoundProblem = (detail: string) =>
  NotFoundProblemSchema.parse({
    type: PROBLEM_TYPES.notFound,
    title: "Not found",
    status: 404,
    detail,
  })

export const buildGitCommandFailedProblem = (detail: string) =>
  UnprocessableProblemSchema.parse({
    type: PROBLEM_TYPES.unprocessable,
    title: "Git command failed",
    status: 422,
    detail,
  })

export const buildGitUnavailableProblem = () =>
  UnprocessableProblemSchema.parse({
    type: PROBLEM_TYPES.unprocessable,
    title: "Git is not available",
    status: 422,
    detail: "git is not available",
  })

export const buildBranchUnavailableProblem = (detail: string) =>
  UnprocessableProblemSchema.parse({
    type: PROBLEM_TYPES.unprocessable,
    title: "Branch comparison unavailable",
    status: 422,
    detail,
  })

export type GitErrorProblem =
  | { status: 400; body: unknown }
  | { status: 404; body: unknown }
  | { status: 422; body: unknown }

export const gitErrorToProblem = (error: GitOperationError): GitErrorProblem => {
  switch (error.kind) {
    case "path":
      return { status: 400, body: buildGitPathValidationProblem(error.error) }
    case "invalid_path":
      return { status: 400, body: buildInvalidGitPathProblem(error.pointer) }
    case "not_git_repository":
      return { status: 404, body: buildNotGitRepositoryProblem() }
    case "not_found":
      return { status: 404, body: buildGitNotFoundProblem(error.detail) }
    case "branch_unavailable":
      return { status: 422, body: buildBranchUnavailableProblem(error.detail) }
    case "git_unavailable":
      return { status: 422, body: buildGitUnavailableProblem() }
    case "git_failed":
      return { status: 422, body: buildGitCommandFailedProblem(error.detail) }
  }
}
