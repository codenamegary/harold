import { PROBLEM_TYPES, ValidationProblemSchema } from "contracts/http/error"
import { FilesystemPathError } from "core/filesystem/errors"

const rootPathErrorCodes: Record<FilesystemPathError["kind"], string> = {
  missing: "validation.field.root.missing",
  not_directory: "validation.field.root.not_directory",
  unreadable: "validation.field.root.unreadable",
}

export const buildRootNotAllowedProblem = () =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/root", code: "validation.field.root.not_allowed" }],
  })

export const buildRootPathValidationProblem = (error: FilesystemPathError) =>
  ValidationProblemSchema.parse({
    type: PROBLEM_TYPES.validationError,
    title: "Request validation failed",
    status: 400,
    code: "validation.request.invalid",
    errors: [{ pointer: "#/root", code: rootPathErrorCodes[error.kind] }],
  })
